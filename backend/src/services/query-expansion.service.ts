/**
 * LLM-based query rewrite + topic resolution for embedding retrieval — tenant-agnostic
 */

import { createHash } from 'crypto';
import { config } from '../config';
import { createChatCompletion as createChatCompletionImpl } from '../ai/openai-client';
import {
  getCachedQueryRewrite,
  setCachedQueryRewrite,
  type QueryRewriteCacheEntry,
} from '../ai/ai-cache.service';

const REWRITE_MAX_TOKENS = 400;
const CONTEXT_MSG_MAX_CHARS = 220;
const CONTEXT_BLOCK_MAX_CHARS = 1600;
const FALLBACK_MERGE_MAX_CHARS = 300;

const SKIP_CONTEXT_PREFIXES = [
  '[Önceki konuşma özeti — sistem]',
  '[SISTEM NOTU:',
];

/** Universal intents → canonical Turkish KB keywords (multi-tenant safe) */
const UNIVERSAL_INTENT_RULES: { pattern: RegExp; canonical: string }[] = [
  {
    pattern:
      /\b(nerede|neredesiniz|konum|where|located|address|adres)\b/i,
    canonical: 'adres konum',
  },
  {
    pattern: /\b(fiyat|ücret|kaç para|price|cost|fee|tuition)\b/i,
    canonical: 'ücret fiyat',
  },
  {
    pattern: /\b(kaçta|saat kaça|açık mı|hours|open)\b/i,
    canonical: 'çalışma saatleri',
  },
  {
    pattern: /\b(telefon|numara|phone|contact|email)\b/i,
    canonical: 'iletişim telefon',
  },
];

export interface RetrievalHistoryMsg {
  sender_type: string;
  message: string;
}

export const queryExpansionDeps = {
  createChatCompletion: createChatCompletionImpl,
};

export function detectUniversalIntentVariant(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  for (const { pattern, canonical } of UNIVERSAL_INTENT_RULES) {
    if (pattern.test(trimmed)) return canonical;
  }
  return null;
}

export function appendUniversalIntentVariant(
  variants: string[],
  message: string
): string[] {
  const intent = detectUniversalIntentVariant(message);
  if (!intent) return variants;
  if (variants.some((v) => v.trim() === intent)) return variants;
  return [...variants, intent];
}

/** Remove canonical intent phrase from LLM variants — intent is passed separately to retrieval */
export function stripIntentFromVariants(
  variants: string[],
  intentVariant: string | null
): string[] {
  if (!intentVariant) return variants;
  const intentKey = intentVariant.trim().toLocaleLowerCase('tr');
  return variants.filter((v) => v.trim().toLocaleLowerCase('tr') !== intentKey);
}

function maxLlmVariants(): number {
  const cap = Number.isFinite(config.rag.maxVariants) && config.rag.maxVariants > 0
    ? config.rag.maxVariants
    : 5;
  return Math.max(1, Math.min(4, cap - 1));
}

export function countMessageWords(message: string): number {
  return message.trim().split(/\s+/).filter(Boolean).length;
}

export function isShortFollowUpMessage(message: string): boolean {
  const max = config.rag.followUpMaxWords;
  if (!Number.isFinite(max) || max <= 0) return false;
  return countMessageWords(message) <= max;
}

function shouldSkipContextMessage(message: string): boolean {
  const trimmed = message.trim();
  return SKIP_CONTEXT_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function roleLabel(senderType: string): string {
  return senderType === 'customer' ? 'Müşteri' : 'Asistan';
}

/**
 * Build conversation context for topic resolution.
 * Oldest → newest, truncated; system summary/note lines excluded.
 */
export function buildRewriteContextBlock(
  history: RetrievalHistoryMsg[],
  currentMessage?: string,
  options?: {
    maxMessages?: number;
    maxMsgChars?: number;
    maxBlockChars?: number;
  }
): string {
  const maxMessages =
    options?.maxMessages ??
    (Number.isFinite(config.rag.rewriteContextMessages)
      ? config.rag.rewriteContextMessages
      : 8);
  if (!maxMessages || maxMessages <= 0) return '';

  const maxMsgChars = options?.maxMsgChars ?? CONTEXT_MSG_MAX_CHARS;
  const maxBlockChars = options?.maxBlockChars ?? CONTEXT_BLOCK_MAX_CHARS;
  const current = currentMessage?.trim() || '';

  const filtered = history.filter((m) => {
    const text = m.message?.trim() || '';
    if (!text) return false;
    if (shouldSkipContextMessage(text)) return false;
    if (current && text === current) return false;
    return true;
  });

  const window = filtered.slice(-maxMessages);
  const lines = window.map((m) => {
    const clipped = m.message.trim().slice(0, maxMsgChars);
    return `${roleLabel(m.sender_type)}: ${clipped}`;
  });

  // Prefer newer messages when the block would exceed the char budget
  while (lines.length > 1 && lines.join('\n').length > maxBlockChars) {
    lines.shift();
  }

  const joined = lines.join('\n');
  return joined.length > maxBlockChars ? joined.slice(0, maxBlockChars) : joined;
}

export function hashRewriteContextKey(contextBlock: string): string {
  const normalized = contextBlock.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr');
  if (!normalized) return '';
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

const REWRITE_SYSTEM_PROMPT = `Sen bilgi bankası araması için konuşma konusu çözümleyicisisin.
Yalnızca geçerli JSON döndür (şema zorunlu).

Alanlar:
- topic: güncel konu, 2-6 kelime Türkçe. Belirsizse "".
- previous_topic: önceki turların konusu; yoksa "".
- topic_changed: son mesaj konuyu değiştirdiyse true.
- depends_on_history: son mesaj tek başına anlaşılmıyorsa true.
- resolved_question: son mesajın bağlamdaki konuya göre tek başına anlaşılır hâli. Zaten anlaşılıyorsa aynen yaz.
- variants: 2-4 kısa arama ifadesi; müşterinin dilinde + en az bir normalize Türkçe ifade.
- is_broad: yalnızca belirsiz/genel isteklerde true.

Kritik — konu değişimi:
- topic_changed true ise geçmişi TAMAMEN yok say. resolved_question ve variants yalnızca son mesajdan; eski konunun kelimeleri sızmasın.
- Örnek: geçmiş pasaport, son "peki yurt ücretleri ne kadar" → topic "yurt ücretleri", topic_changed true, pasaport geçmez.
- Örnek: geçmiş yurt, son "hazırlık sınavı ne zaman" → topic "İngilizce hazırlık sınavı tarihi", topic_changed true.
- Örnek: geçmiş pasaport, son "2 yıllığına verildi oluyor mu" → topic_changed false, depends_on_history true, resolved_question pasaport bağlamını taşır.`;

const REWRITE_JSON_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'query_topic_rewrite',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        previous_topic: { type: 'string' },
        topic_changed: { type: 'boolean' },
        depends_on_history: { type: 'boolean' },
        resolved_question: { type: 'string' },
        variants: {
          type: 'array',
          items: { type: 'string' },
        },
        is_broad: { type: 'boolean' },
      },
      required: [
        'topic',
        'previous_topic',
        'topic_changed',
        'depends_on_history',
        'resolved_question',
        'variants',
        'is_broad',
      ],
      additionalProperties: false,
    },
  },
};

export interface ParsedQueryRewrite {
  variants: string[];
  isBroad: boolean;
  topic: string;
  previousTopic: string;
  topicChanged: boolean;
  dependsOnHistory: boolean;
  resolvedQuestion: string;
}

export interface QueryRewriteResult extends QueryRewriteCacheEntry {
  rawMessage: string;
  /** Canonical KB keywords from universal intent rules (not part of LLM variants) */
  intentVariant: string | null;
  topic: string;
  previousTopic: string;
  topicChanged: boolean;
  dependsOnHistory: boolean;
  resolvedQuestion: string;
}

export function parseQueryRewriteResponse(
  text: string,
  fallbackResolved = ''
): ParsedQueryRewrite {
  const empty: ParsedQueryRewrite = {
    variants: [],
    isBroad: false,
    topic: '',
    previousTopic: '',
    topicChanged: false,
    dependsOnHistory: false,
    resolvedQuestion: fallbackResolved,
  };

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no json');
    const obj = JSON.parse(jsonMatch[0]) as {
      variants?: unknown;
      is_broad?: unknown;
      topic?: unknown;
      previous_topic?: unknown;
      topic_changed?: unknown;
      depends_on_history?: unknown;
      resolved_question?: unknown;
    };
    const variants = Array.isArray(obj.variants)
      ? obj.variants
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .map((v) => v.trim())
          .slice(0, maxLlmVariants())
      : [];

    const resolved =
      typeof obj.resolved_question === 'string' && obj.resolved_question.trim()
        ? obj.resolved_question.trim()
        : fallbackResolved;

    return {
      variants,
      isBroad: obj.is_broad === true,
      topic: typeof obj.topic === 'string' ? obj.topic.trim() : '',
      previousTopic:
        typeof obj.previous_topic === 'string' ? obj.previous_topic.trim() : '',
      topicChanged: obj.topic_changed === true,
      dependsOnHistory: obj.depends_on_history === true,
      resolvedQuestion: resolved,
    };
  } catch {
    return empty;
  }
}

function finalizeRewriteVariants(message: string, llmVariants: string[]): string[] {
  const trimmed = message.trim();
  const intentVariant = detectUniversalIntentVariant(trimmed);
  const base = llmVariants.length > 0 ? llmVariants : trimmed ? [trimmed] : [];
  return stripIntentFromVariants(base, intentVariant);
}

function findLastCustomerMessage(
  history: RetrievalHistoryMsg[],
  current: string
): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.sender_type !== 'customer') continue;
    const text = m.message?.trim() || '';
    if (!text || shouldSkipContextMessage(text)) continue;
    if (text === current) continue;
    return text;
  }
  return null;
}

function fallbackRewrite(
  message: string,
  history: RetrievalHistoryMsg[] = []
): QueryRewriteResult {
  const trimmed = message.trim();
  let dependsOnHistory = false;
  let resolvedQuestion = trimmed;

  if (trimmed && isShortFollowUpMessage(trimmed)) {
    const prev = findLastCustomerMessage(history, trimmed);
    if (prev) {
      dependsOnHistory = true;
      resolvedQuestion = `${prev} ${trimmed}`.trim().slice(0, FALLBACK_MERGE_MAX_CHARS);
    }
  }

  const intentSource = resolvedQuestion || trimmed;
  const intentVariant = detectUniversalIntentVariant(intentSource);

  return {
    rawMessage: trimmed,
    variants: finalizeRewriteVariants(intentSource, intentSource ? [intentSource] : []),
    intentVariant,
    isBroad: false,
    topic: '',
    previousTopic: '',
    topicChanged: false,
    dependsOnHistory,
    resolvedQuestion: resolvedQuestion || trimmed,
  };
}

function resultFromCache(
  trimmed: string,
  cached: QueryRewriteCacheEntry
): QueryRewriteResult {
  const intentVariant = detectUniversalIntentVariant(
    cached.resolvedQuestion?.trim() || trimmed
  );
  return {
    rawMessage: trimmed,
    variants: stripIntentFromVariants(cached.variants, intentVariant),
    intentVariant,
    isBroad: cached.isBroad,
    topic: cached.topic ?? '',
    previousTopic: cached.previousTopic ?? '',
    topicChanged: cached.topicChanged === true,
    dependsOnHistory: cached.dependsOnHistory === true,
    resolvedQuestion: cached.resolvedQuestion?.trim() || trimmed,
  };
}

function buildUserPrompt(trimmed: string, contextBlock: string): string {
  if (!contextBlock) return trimmed;
  return `Önceki konuşma:\n${contextBlock}\n\nSon müşteri mesajı:\n${trimmed}`;
}

export async function expandQueryForRetrieval(
  companyId: string,
  message: string,
  history: RetrievalHistoryMsg[] = []
): Promise<QueryRewriteResult> {
  const trimmed = message.trim();
  if (!trimmed) return fallbackRewrite('');

  const contextBlock = buildRewriteContextBlock(history, trimmed);
  const contextKey = hashRewriteContextKey(contextBlock);

  const cached = getCachedQueryRewrite(companyId, trimmed, contextKey || undefined);
  if (cached) {
    return resultFromCache(trimmed, cached);
  }

  try {
    const completion = await queryExpansionDeps.createChatCompletion(
      [
        { role: 'system', content: REWRITE_SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(trimmed, contextBlock) },
      ],
      {
        model: config.rag.rewriteModel,
        maxTokens: REWRITE_MAX_TOKENS,
        temperature: 0,
        responseFormat: REWRITE_JSON_SCHEMA,
        usageLog: {
          companyId,
          skipReason: 'query_rewrite',
        },
      }
    );

    const content = completion.choices[0]?.message?.content?.trim() || '';
    const parsed = parseQueryRewriteResponse(content, trimmed);
    const intentSource = parsed.resolvedQuestion || trimmed;
    const intentVariant = detectUniversalIntentVariant(intentSource);

    const result: QueryRewriteResult = {
      rawMessage: trimmed,
      variants: finalizeRewriteVariants(intentSource, parsed.variants),
      intentVariant,
      isBroad: parsed.isBroad,
      topic: parsed.topic,
      previousTopic: parsed.previousTopic,
      topicChanged: parsed.topicChanged,
      dependsOnHistory: parsed.dependsOnHistory,
      resolvedQuestion: parsed.resolvedQuestion || trimmed,
    };

    setCachedQueryRewrite(
      companyId,
      trimmed,
      {
        variants: result.variants,
        isBroad: result.isBroad,
        topic: result.topic,
        previousTopic: result.previousTopic,
        topicChanged: result.topicChanged,
        dependsOnHistory: result.dependsOnHistory,
        resolvedQuestion: result.resolvedQuestion,
      },
      contextKey || undefined
    );

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[RAG] Query rewrite failed, using raw message:', msg);
    return fallbackRewrite(trimmed, history);
  }
}
