/**
 * LLM-based query rewrite for embedding retrieval — tenant-agnostic
 */

import { config } from '../config';
import { createChatCompletion } from '../ai/openai-client';
import {
  getCachedQueryRewrite,
  setCachedQueryRewrite,
  type QueryRewriteCacheEntry,
} from '../ai/ai-cache.service';

const REWRITE_MODEL = 'gpt-4o-mini';

/** Universal intents → canonical Turkish KB keywords (multi-tenant safe) */
const UNIVERSAL_INTENT_RULES: { pattern: RegExp; canonical: string }[] = [
  {
    pattern:
      /\b(nerede|neredesiniz|konum|where|located|address|adres)\b/i,
    canonical: 'adres konum ulaşım',
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
  return Math.max(1, cap - 2);
}

const REWRITE_SYSTEM_PROMPT = `Rewrite the customer message for knowledge-base semantic search.
Output ONLY valid JSON with this shape:
{"variants":["phrase1","phrase2","phrase3"],"is_broad":false}

Rules:
- variants: exactly 2-3 short search phrases in the SAME language as the customer, PLUS one normalized Turkish phrase (even if the customer wrote in another language). Keep each phrase under 12 words.
- is_broad: true only when the message is a vague/general request with no specific topic (e.g. "tell me about your company", "what services do you offer", "hakkınızda bilgi"). False for specific questions (prices, hours, a named service, etc.).`;

export interface QueryRewriteResult extends QueryRewriteCacheEntry {
  rawMessage: string;
  /** Canonical KB keywords from universal intent rules (not part of LLM variants) */
  intentVariant: string | null;
}

export function parseQueryRewriteResponse(text: string): { variants: string[]; isBroad: boolean } {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no json');
    const obj = JSON.parse(jsonMatch[0]) as { variants?: unknown; is_broad?: unknown };
    const variants = Array.isArray(obj.variants)
      ? obj.variants
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .map((v) => v.trim())
          .slice(0, maxLlmVariants())
      : [];
    return {
      variants,
      isBroad: obj.is_broad === true,
    };
  } catch {
    return { variants: [], isBroad: false };
  }
}

function finalizeRewriteVariants(message: string, llmVariants: string[]): string[] {
  const trimmed = message.trim();
  const intentVariant = detectUniversalIntentVariant(trimmed);
  const base = llmVariants.length > 0 ? llmVariants : trimmed ? [trimmed] : [];
  return stripIntentFromVariants(base, intentVariant);
}

function fallbackRewrite(message: string): QueryRewriteResult {
  const trimmed = message.trim();
  const intentVariant = detectUniversalIntentVariant(trimmed);
  return {
    rawMessage: trimmed,
    variants: finalizeRewriteVariants(trimmed, trimmed ? [trimmed] : []),
    intentVariant,
    isBroad: false,
  };
}

export async function expandQueryForRetrieval(
  companyId: string,
  message: string
): Promise<QueryRewriteResult> {
  const trimmed = message.trim();
  if (!trimmed) return fallbackRewrite('');

  const cached = getCachedQueryRewrite(companyId, trimmed);
  if (cached) {
    const intentVariant = detectUniversalIntentVariant(trimmed);
    return {
      rawMessage: trimmed,
      variants: stripIntentFromVariants(cached.variants, intentVariant),
      intentVariant,
      isBroad: cached.isBroad,
    };
  }

  try {
    const completion = await createChatCompletion(
      [
        { role: 'system', content: REWRITE_SYSTEM_PROMPT },
        { role: 'user', content: trimmed },
      ],
      {
        model: REWRITE_MODEL,
        maxTokens: 60,
        temperature: 0,
        usageLog: {
          companyId,
          skipReason: 'query_rewrite',
        },
      }
    );

    const content = completion.choices[0]?.message?.content?.trim() || '';
    const parsed = parseQueryRewriteResponse(content);
    const intentVariant = detectUniversalIntentVariant(trimmed);

    const result: QueryRewriteResult = {
      rawMessage: trimmed,
      variants: finalizeRewriteVariants(trimmed, parsed.variants),
      intentVariant,
      isBroad: parsed.isBroad,
    };

    setCachedQueryRewrite(companyId, trimmed, {
      variants: result.variants,
      isBroad: result.isBroad,
    });

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[RAG] Query rewrite failed, using raw message:', msg);
    return fallbackRewrite(trimmed);
  }
}
