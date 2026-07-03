/**
 * Hybrid knowledge retrieval — pgvector + full-text search (embedding-first)
 */

import { config } from '../config';
import { adminClient } from '../database/supabase';
import { createEmbeddings as createEmbeddingsImpl } from './embedding.service';
import { expandQueryForRetrieval } from './query-expansion.service';
import {
  buildKnowledgeContextForAI,
  filterRelevantKnowledge,
} from '../ai/knowledge-filter.service';
import type { KnowledgeItem, RetrievedKnowledgeChunk } from '../types';

/** Test / override hooks for embedding + RPC (see webhookDeps pattern) */
export const knowledgeRetrievalDeps = {
  createEmbeddings: createEmbeddingsImpl,
  matchKnowledgeChunksRpc: (
    companyId: string,
    queryText: string,
    embedding: number[]
  ) =>
    adminClient.rpc('match_knowledge_chunks', {
      p_company_id: companyId,
      query_embedding: embedding,
      query_text: queryText,
      match_count: config.rag.topK,
      match_threshold: config.rag.matchThreshold,
      vector_weight: config.rag.vectorWeight,
      text_weight: config.rag.textWeight,
    }),
};

export interface KnowledgeRetrievalResult {
  context: string;
  chunks: RetrievedKnowledgeChunk[];
  usedRag: boolean;
  /** Yalnızca embedding API hatasında devreye girer */
  usedLexicalFallback: boolean;
  fallbackItems: KnowledgeItem[];
  /** İndeks hazır ama sorguya uygun chunk bulunamadı */
  kbHasNoMatch: boolean;
}

export function resolveRetrievalVariantCap(): number {
  const cap = config.rag.maxVariants;
  return Number.isFinite(cap) && cap > 0 ? cap : 5;
}

export function buildRetrievalTexts(
  rawMessage: string,
  variants: string[],
  intentVariant: string | null = null
): string[] {
  const cap = resolveRetrievalVariantCap();
  const raw = rawMessage.trim();
  const intent = intentVariant?.trim() || null;
  const intentKey = intent?.toLocaleLowerCase('tr') ?? null;
  const rawKey = raw.toLocaleLowerCase('tr');

  const deduped: string[] = [];
  const seen = new Set<string>();

  const push = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const key = trimmed.toLocaleLowerCase('tr');
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(trimmed);
  };

  push(raw);
  push(intent);
  for (const variant of variants) {
    const trimmed = variant.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase('tr');
    if (key === rawKey || (intentKey && key === intentKey)) continue;
    push(trimmed);
  }

  return deduped.slice(0, cap);
}

export function mergeRetrievalChunksByMax(
  resultSets: RetrievedKnowledgeChunk[][]
): RetrievedKnowledgeChunk[] {
  const byId = new Map<string, RetrievedKnowledgeChunk>();

  for (const chunks of resultSets) {
    for (const chunk of chunks) {
      const prev = byId.get(chunk.id);
      if (!prev) {
        byId.set(chunk.id, { ...chunk });
        continue;
      }
      byId.set(chunk.id, {
        ...prev,
        similarity: Math.max(prev.similarity, chunk.similarity),
        text_rank: Math.max(prev.text_rank, chunk.text_rank),
        combined_score: Math.max(prev.combined_score, chunk.combined_score),
      });
    }
  }

  return Array.from(byId.values());
}

export function hasStrongRetrievalMatch(chunks: RetrievedKnowledgeChunk[]): boolean {
  if (!chunks.length) return false;
  const maxSimilarity = Math.max(...chunks.map((c) => c.similarity));
  const maxTextRank = Math.max(...chunks.map((c) => c.text_rank));
  return maxSimilarity >= config.rag.matchThreshold || maxTextRank > 0;
}

export function buildContextFromChunks(chunks: RetrievedKnowledgeChunk[]): string {
  if (!chunks.length) return '';

  const parts = chunks.map((chunk) => {
    const header = chunk.heading ? `### ${chunk.heading}` : '### Bilgi';
    return `${header}\n${chunk.content}`;
  });

  let context = parts.join('\n\n');
  if (context.length > config.rag.maxContextChars) {
    context = `${context.slice(0, config.rag.maxContextChars)}\n...[kısaltıldı]`;
  }
  return context;
}

/** Top-k sıralama; eşik üstü yoksa en iyi K chunk yine döner (LLM seçer) */
export function finalizeRetrievalChunks(
  rawChunks: RetrievedKnowledgeChunk[],
  topK = config.rag.topK,
  threshold = config.rag.matchThreshold
): RetrievedKnowledgeChunk[] {
  const sorted = [...rawChunks].sort((a, b) => b.combined_score - a.combined_score);
  const aboveThreshold = sorted.filter((c) => c.combined_score >= threshold);
  const pool = aboveThreshold.length > 0 ? aboveThreshold : sorted;
  return pool.slice(0, topK);
}

export function logRetrievalDiagnostics(
  query: string,
  texts: string[],
  intentVariant: string | null,
  chunks: RetrievedKnowledgeChunk[]
): void {
  const q = query.slice(0, 40);
  const textPreview = texts.map((t) => t.slice(0, 28)).join(' | ');
  const top = chunks
    .slice(0, 3)
    .map((c) => `${c.heading ?? '—'}:${c.combined_score.toFixed(3)}`)
    .join(', ');
  const strong = hasStrongRetrievalMatch(chunks);
  console.log(
    `[RAG] q="${q}" texts=${texts.length} intent=${intentVariant ? `"${intentVariant.slice(0, 24)}"` : 'none'} [${textPreview}] top=[${top}] strong=${strong}`
  );
}

function buildLexicalFallbackResult(
  fallbackItems: KnowledgeItem[],
  query: string,
  isBroad = false
): KnowledgeRetrievalResult {
  const kbFilter = filterRelevantKnowledge(fallbackItems, query, { isBroad });
  const context = buildKnowledgeContextForAI(kbFilter, fallbackItems, query);

  return {
    context,
    chunks: [],
    usedRag: false,
    usedLexicalFallback: true,
    fallbackItems: kbFilter.items,
    kbHasNoMatch: !kbFilter.hasRelevantContent && fallbackItems.length > 0,
  };
}

async function countReadyDocuments(companyId: string): Promise<number> {
  const { count } = await adminClient
    .from('knowledge_documents')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('index_status', 'ready');

  return count ?? 0;
}

async function queryKnowledgeChunksRaw(
  companyId: string,
  queryText: string,
  embedding: number[]
): Promise<RetrievedKnowledgeChunk[]> {
  const { data, error } = await knowledgeRetrievalDeps.matchKnowledgeChunksRpc(
    companyId,
    queryText,
    embedding
  );

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as RetrievedKnowledgeChunk[];
}

/** Collect fulfilled variant RPC results; log rejected variants */
export function collectFulfilledVariantResults(
  texts: string[],
  settled: PromiseSettledResult<RetrievedKnowledgeChunk[]>[]
): RetrievedKnowledgeChunk[][] {
  const resultSets: RetrievedKnowledgeChunk[][] = [];

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === 'fulfilled') {
      resultSets.push(outcome.value);
      continue;
    }
    const variant = texts[i]?.slice(0, 40) ?? '?';
    const reason =
      outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
    console.warn(`[RAG] Variant RPC failed for "${variant}": ${reason}`);
  }

  return resultSets;
}

export function allVariantRetrievalsFailed(
  settled: PromiseSettledResult<unknown>[]
): boolean {
  return settled.length > 0 && settled.every((outcome) => outcome.status === 'rejected');
}

async function queryAllVariantChunks(
  companyId: string,
  texts: string[],
  embeddings: number[][]
): Promise<RetrievedKnowledgeChunk[][]> {
  const settled = await Promise.allSettled(
    texts.map((text, index) =>
      queryKnowledgeChunksRaw(companyId, text, embeddings[index] || [])
    )
  );

  if (allVariantRetrievalsFailed(settled)) {
    throw new Error('All variant RPC calls failed');
  }

  return collectFulfilledVariantResults(texts, settled);
}

export async function retrieveKnowledgeContext(
  companyId: string,
  query: string,
  fallbackItems: KnowledgeItem[] = []
): Promise<KnowledgeRetrievalResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      context: '',
      chunks: [],
      usedRag: false,
      usedLexicalFallback: false,
      fallbackItems,
      kbHasNoMatch: false,
    };
  }

  const readyCount = await countReadyDocuments(companyId);
  if (!readyCount) {
    return {
      context: '',
      chunks: [],
      usedRag: false,
      usedLexicalFallback: false,
      fallbackItems,
      kbHasNoMatch: fallbackItems.length > 0,
    };
  }

  const rewrite = await expandQueryForRetrieval(companyId, trimmed);
  const texts = buildRetrievalTexts(trimmed, rewrite.variants, rewrite.intentVariant);

  try {
    const embeddings = await knowledgeRetrievalDeps.createEmbeddings(texts);
    const resultSets = await queryAllVariantChunks(companyId, texts, embeddings);
    const merged = mergeRetrievalChunksByMax(resultSets);
    const chunks = finalizeRetrievalChunks(merged);
    logRetrievalDiagnostics(trimmed, texts, rewrite.intentVariant, chunks);

    if (!chunks.length) {
      return {
        context: '',
        chunks: [],
        usedRag: true,
        usedLexicalFallback: false,
        fallbackItems,
        kbHasNoMatch: true,
      };
    }

    const hasStrongMatch = hasStrongRetrievalMatch(chunks);

    return {
      context: buildContextFromChunks(chunks),
      chunks,
      usedRag: true,
      usedLexicalFallback: false,
      fallbackItems,
      kbHasNoMatch: !hasStrongMatch,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[RAG] Embedding retrieval failed, lexical fallback:', message);
    return buildLexicalFallbackResult(fallbackItems, trimmed, rewrite.isBroad);
  }
}

export async function getKnowledgeChunkPreviews(
  companyId: string,
  knowledgeBaseId: string,
  limit = 5
): Promise<{ chunk_count: number; previews: { index: number; heading: string | null; preview: string }[] }> {
  const { data: kb } = await adminClient
    .from('knowledge_base')
    .select('chunk_count')
    .eq('id', knowledgeBaseId)
    .eq('company_id', companyId)
    .single();

  const { data: chunks } = await adminClient
    .from('knowledge_chunks')
    .select('chunk_index, heading, content')
    .eq('knowledge_base_id', knowledgeBaseId)
    .eq('company_id', companyId)
    .order('chunk_index', { ascending: true })
    .limit(limit);

  return {
    chunk_count: kb?.chunk_count || 0,
    previews: (chunks || []).map((c) => ({
      index: c.chunk_index,
      heading: c.heading,
      preview: (c.content || '').slice(0, 280),
    })),
  };
}
