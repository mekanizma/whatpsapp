/**
 * Dinamik sorgu analizi — dil, niyet ve kavram çıkarımı (sektör/dil bağımsız)
 */

import { createChatCompletion } from '../ai/openai-client';
import { config } from '../config';
import { detectConversationLanguage, type ConversationLang } from '../ai/language.service';

export interface QueryAnalysis {
  language: string;
  intent: string;
  concepts: string[];
  expandedSearchText: string;
}

const FALLBACK_ANALYSIS = (message: string, lang: ConversationLang): QueryAnalysis => ({
  language: lang,
  intent: 'general inquiry',
  concepts: [],
  expandedSearchText: message.trim(),
});

function buildEmbeddingInput(message: string, analysis: QueryAnalysis): string {
  const parts = [message.trim()];
  if (analysis.concepts.length) {
    parts.push(analysis.concepts.join(' '));
  }
  if (analysis.expandedSearchText && analysis.expandedSearchText !== message.trim()) {
    parts.push(analysis.expandedSearchText);
  }
  return parts.join('\n').slice(0, 8000);
}

export function buildSearchEmbeddingText(message: string, analysis: QueryAnalysis): string {
  return buildEmbeddingInput(message, analysis);
}

async function analyzeWithLLM(message: string): Promise<QueryAnalysis | null> {
  const completion = await createChatCompletion(
    [
      {
        role: 'system',
        content: `You prepare customer messages for multilingual semantic knowledge base search.
Return JSON only with this shape:
{
  "language": "ISO 639-1 code",
  "intent": "brief intent in English",
  "concepts": ["key concept 1", "key concept 2"],
  "expanded_terms": "space-separated synonymous terms and cross-language translations for embedding search"
}
Rules:
- Sector-agnostic: works for university, clinic, hotel, law, any business
- Include cross-language synonyms (TR, EN, DE, RU, AR, FR, EL and others as relevant)
- Do not invent business-specific facts
- expanded_terms max 80 words`,
      },
      { role: 'user', content: message.slice(0, 1500) },
    ],
    {
      maxTokens: 220,
      temperature: 0,
      responseFormat: { type: 'json_object' },
    }
  );

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) return null;

  const parsed = JSON.parse(raw) as {
    language?: string;
    intent?: string;
    concepts?: string[];
    expanded_terms?: string;
  };

  const concepts = Array.isArray(parsed.concepts)
    ? parsed.concepts.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    : [];

  const expanded = (parsed.expanded_terms || '').trim() || message.trim();

  return {
    language: (parsed.language || 'und').toLowerCase(),
    intent: (parsed.intent || 'general inquiry').trim(),
    concepts,
    expandedSearchText: expanded,
  };
}

/** Mesaj dilini, niyetini ve semantik arama için genişletilmiş terimleri çıkarır */
export async function analyzeQueryForSearch(
  message: string,
  options?: { timeoutMs?: number }
): Promise<QueryAnalysis> {
  const trimmed = message.trim();
  const detectedLang = detectConversationLanguage(trimmed);

  if (!trimmed) {
    return FALLBACK_ANALYSIS(trimmed, detectedLang);
  }

  const timeoutMs = options?.timeoutMs ?? config.rag.queryAnalysisTimeoutMs;

  try {
    const result = await Promise.race([
      analyzeWithLLM(trimmed),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (result) return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[KnowledgeSearch] Query analysis fallback:', msg);
  }

  return FALLBACK_ANALYSIS(trimmed, detectedLang);
}
