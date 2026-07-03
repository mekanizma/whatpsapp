/**
 * LLM-based query rewrite for embedding retrieval — tenant-agnostic
 */

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
          .slice(0, 4)
      : [];
    return {
      variants,
      isBroad: obj.is_broad === true,
    };
  } catch {
    return { variants: [], isBroad: false };
  }
}

function fallbackRewrite(message: string): QueryRewriteResult {
  const trimmed = message.trim();
  return {
    rawMessage: trimmed,
    variants: trimmed ? [trimmed] : [],
    intentVariant: detectUniversalIntentVariant(trimmed),
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
    return {
      ...cached,
      rawMessage: trimmed,
      intentVariant: detectUniversalIntentVariant(trimmed),
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
    const variants =
      parsed.variants.length > 0 ? parsed.variants : [trimmed];

    const result: QueryRewriteResult = {
      rawMessage: trimmed,
      variants,
      intentVariant: detectUniversalIntentVariant(trimmed),
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
