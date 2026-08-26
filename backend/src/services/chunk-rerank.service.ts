/**
 * LLM citation filter — drop off-topic KB chunks before the answer model runs
 */

import { config } from '../config';
import { createChatCompletion as createChatCompletionImpl } from '../ai/openai-client';
import type { RetrievedKnowledgeChunk } from '../types';

const CHUNK_PREVIEW_CHARS = 300;
const RERANK_MAX_TOKENS = 400;

export interface RerankedChunk {
  chunk: RetrievedKnowledgeChunk;
  score: number;
  reason: string;
}

export const chunkRerankDeps = {
  createChatCompletion: createChatCompletionImpl,
};

const RERANK_SYSTEM_PROMPT = `Sen bilgi bankası alıntı eleme asistanısın.
Her parçaya 0.0–1.0 arası skor ver: "bu parça sorulan soruyu yanıtlar mı?"
Aynı kelimeyi paylaşmak yeterli değildir; parça, sorulan konunun kendisi hakkında olmalıdır.
Farklı bir konudaki parçaya 0.2'nin altında puan ver.
Örnek: soru eğitim ücreti / parça yurt ücretleri → 0.0
Yalnızca JSON döndür.`;

const RERANK_JSON_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'chunk_rerank_scores',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        scores: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              index: { type: 'number' },
              score: { type: 'number' },
              reason: { type: 'string' },
            },
            required: ['index', 'score', 'reason'],
            additionalProperties: false,
          },
        },
      },
      required: ['scores'],
      additionalProperties: false,
    },
  },
};

function buildRerankUserPrompt(
  resolvedQuestion: string,
  topic: string | null,
  chunks: RetrievedKnowledgeChunk[]
): string {
  const topicLine = topic?.trim() ? `Konu: ${topic.trim()}\n` : '';
  const chunkLines = chunks
    .map((c, index) => {
      const heading = c.heading?.trim() || '(başlıksız)';
      const preview = (c.content || '').slice(0, CHUNK_PREVIEW_CHARS);
      return `[${index}] heading: ${heading}\n${preview}`;
    })
    .join('\n\n');

  return `${topicLine}Soru: ${resolvedQuestion}\n\nParçalar:\n${chunkLines}`;
}

export function parseRerankScores(
  text: string,
  chunkCount: number
): { index: number; score: number; reason: string }[] {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no json');
    const obj = JSON.parse(jsonMatch[0]) as {
      scores?: { index?: unknown; score?: unknown; reason?: unknown }[];
    };
    if (!Array.isArray(obj.scores)) return [];

    return obj.scores
      .map((s) => ({
        index: typeof s.index === 'number' ? s.index : Number(s.index),
        score: typeof s.score === 'number' ? s.score : Number(s.score),
        reason: typeof s.reason === 'string' ? s.reason : '',
      }))
      .filter(
        (s) =>
          Number.isFinite(s.index) &&
          s.index >= 0 &&
          s.index < chunkCount &&
          Number.isFinite(s.score)
      );
  } catch {
    return [];
  }
}

export function applyRerankScores(
  chunks: RetrievedKnowledgeChunk[],
  scores: { index: number; score: number; reason: string }[],
  minScore: number,
  keep: number
): RetrievedKnowledgeChunk[] {
  const byIndex = new Map<number, number>();
  for (const s of scores) {
    const prev = byIndex.get(s.index);
    if (prev === undefined || s.score > prev) byIndex.set(s.index, s.score);
  }

  const ranked = chunks
    .map((chunk, index) => ({
      chunk,
      score: byIndex.get(index) ?? 0,
    }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, keep));

  return ranked.map((r) => r.chunk);
}

export async function rerankChunks(
  companyId: string,
  resolvedQuestion: string,
  topic: string | null,
  chunks: RetrievedKnowledgeChunk[]
): Promise<{ kept: RetrievedKnowledgeChunk[]; dropped: number; tokensUsed: number }> {
  if (!config.rag.rerankEnabled || chunks.length <= 1) {
    return { kept: chunks, dropped: 0, tokensUsed: 0 };
  }

  const question = resolvedQuestion.trim();
  if (!question) {
    return { kept: chunks, dropped: 0, tokensUsed: 0 };
  }

  try {
    const completion = await chunkRerankDeps.createChatCompletion(
      [
        { role: 'system', content: RERANK_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildRerankUserPrompt(question, topic, chunks),
        },
      ],
      {
        model: config.rag.rerankModel,
        maxTokens: RERANK_MAX_TOKENS,
        temperature: 0,
        responseFormat: RERANK_JSON_SCHEMA,
        usageLog: {
          companyId,
          skipReason: 'chunk_rerank',
        },
      }
    );

    const content = completion.choices[0]?.message?.content?.trim() || '';
    const scores = parseRerankScores(content, chunks.length);
    if (!scores.length) {
      console.warn('[RAG] Chunk rerank returned no scores — keeping input');
      return { kept: chunks, dropped: 0, tokensUsed: completion.usage?.total_tokens || 0 };
    }

    const kept = applyRerankScores(
      chunks,
      scores,
      config.rag.rerankMinScore,
      config.rag.rerankKeep
    );

    return {
      kept,
      dropped: Math.max(0, chunks.length - kept.length),
      tokensUsed: completion.usage?.total_tokens || 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[RAG] Chunk rerank failed, keeping input:', msg);
    return { kept: chunks, dropped: 0, tokensUsed: 0 };
  }
}
