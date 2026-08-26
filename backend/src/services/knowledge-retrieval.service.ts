/**
 * Hybrid knowledge retrieval — pgvector + full-text search (embedding-first)
 */

import { config } from '../config';
import { adminClient } from '../database/supabase';
import { createEmbeddings as createEmbeddingsImpl } from './embedding.service';
import {
  expandQueryForRetrieval as expandQueryForRetrievalImpl,
  type RetrievalHistoryMsg,
} from './query-expansion.service';
import { rerankChunks as rerankChunksImpl } from './chunk-rerank.service';
import {
  buildKnowledgeContextForAI,
  filterRelevantKnowledge,
} from '../ai/knowledge-filter.service';
import type { KnowledgeItem, KnowledgeSourceRef, RetrievedKnowledgeChunk } from '../types';

/** Test / override hooks for embedding + RPC (see webhookDeps pattern) */
export const knowledgeRetrievalDeps = {
  createEmbeddings: createEmbeddingsImpl,
  countReadyDocuments: countReadyDocumentsImpl,
  isCompanyVectorIndexReady: isCompanyVectorIndexReadyImpl,
  expandQueryForRetrieval: expandQueryForRetrievalImpl,
  rerankChunks: rerankChunksImpl,
  matchKnowledgeChunksRpc: (
    companyId: string,
    queryText: string,
    embedding: number[],
    knowledgeBaseIds?: string[] | null
  ) =>
    adminClient.rpc('match_knowledge_chunks', {
      p_company_id: companyId,
      query_embedding: embedding,
      query_text: queryText,
      match_count: config.rag.topK,
      match_threshold: config.rag.matchThreshold,
      vector_weight: config.rag.vectorWeight,
      text_weight: config.rag.textWeight,
      ...(knowledgeBaseIds?.length
        ? { p_knowledge_base_ids: knowledgeBaseIds }
        : {}),
    }),
};

export interface KnowledgeRetrievalOptions {
  history?: RetrievalHistoryMsg[];
  /** null/undefined = tüm şirket KB; dolu dizi = yalnızca atanan KB id'leri */
  knowledgeBaseIds?: string[] | null;
}

export interface KnowledgeRetrievalResult {
  context: string;
  chunks: RetrievedKnowledgeChunk[];
  usedRag: boolean;
  /** Yalnızca embedding API hatasında devreye girer */
  usedLexicalFallback: boolean;
  fallbackItems: KnowledgeItem[];
  /** İndeks hazır ama sorguya uygun chunk bulunamadı */
  kbHasNoMatch: boolean;
  topic?: string;
  resolvedQuestion?: string;
  topicChanged?: boolean;
  dependsOnHistory?: boolean;
}

export function resolveRetrievalVariantCap(): number {
  const cap = config.rag.maxVariants;
  return Number.isFinite(cap) && cap > 0 ? cap : 5;
}

export function buildRetrievalTexts(
  rawMessage: string,
  variants: string[],
  intentVariant: string | null = null,
  options?: {
    resolvedQuestion?: string | null;
    topic?: string | null;
  }
): string[] {
  const cap = resolveRetrievalVariantCap();
  const raw = rawMessage.trim();
  const resolved = options?.resolvedQuestion?.trim() || null;
  const topic = options?.topic?.trim() || null;
  const intent = intentVariant?.trim() || null;

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

  push(resolved || raw);
  push(topic);
  push(intent);
  for (const variant of variants) {
    push(variant);
  }
  if (resolved && raw && resolved.toLocaleLowerCase('tr') !== raw.toLocaleLowerCase('tr')) {
    push(raw);
  }

  return deduped.slice(0, cap);
}

/** Hat/hesap bazlı KB ataması — RPC sonrası güvenlik ağı */
export function filterChunksByKnowledgeBaseIds(
  chunks: RetrievedKnowledgeChunk[],
  knowledgeBaseIds: string[] | null | undefined
): RetrievedKnowledgeChunk[] {
  if (!knowledgeBaseIds?.length) return chunks;
  const allowed = new Set(knowledgeBaseIds);
  return chunks.filter((c) => allowed.has(c.knowledge_base_id));
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
  const threshold = config.rag.matchThreshold;
  const minLexical = config.rag.minLexicalRank;
  return chunks.some(
    (c) =>
      c.combined_score >= threshold ||
      c.similarity >= threshold ||
      c.text_rank >= minLexical
  );
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

/** Chunk içeriğinden "Konu:" önekini temizle; satır araması için gövdeyi al */
function chunkBodyForLineSearch(chunkContent: string): string {
  const trimmed = chunkContent.trim();
  const konu = trimmed.match(/^Konu:\s*[^\n]+\n\n([\s\S]*)$/);
  return (konu?.[1] || trimmed).trim();
}

/** Bilgi bankası metninde chunk'ın yaklaşık başlangıç satırı (1-based) */
export function estimateChunkStartLine(
  kbContent: string | null | undefined,
  chunkContent: string
): number | null {
  if (!kbContent?.trim() || !chunkContent?.trim()) return null;

  const body = chunkBodyForLineSearch(chunkContent);
  const probe =
    body
      .split(/\n+/)
      .map((l) => l.trim())
      .find((l) => l.length >= 24) || body.slice(0, 120).trim();

  if (!probe || probe.length < 12) return null;

  const idx = kbContent.indexOf(probe);
  if (idx < 0) return null;

  return kbContent.slice(0, idx).split('\n').length;
}

/**
 * RAG / lexical sonuçlarından yöneticiye gösterilecek kaynak listesi.
 * Aynı KB + chunk tekrarlarını tekilleştirir.
 */
export function buildKnowledgeSources(
  chunks: RetrievedKnowledgeChunk[],
  allKnowledge: KnowledgeItem[],
  fallbackItems: KnowledgeItem[] = [],
  usedLexicalFallback = false
): KnowledgeSourceRef[] {
  const byId = new Map(allKnowledge.map((k) => [k.id, k]));

  if (chunks.length) {
    const seen = new Set<string>();
    const sources: KnowledgeSourceRef[] = [];

    for (const chunk of chunks) {
      const key = `${chunk.knowledge_base_id}:${chunk.chunk_index}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const kb = byId.get(chunk.knowledge_base_id);
      sources.push({
        knowledge_base_id: chunk.knowledge_base_id,
        title: kb?.title?.trim() || 'Bilgi Bankası',
        chunk_index: chunk.chunk_index,
        line_start: estimateChunkStartLine(kb?.content, chunk.content),
        heading: chunk.heading,
      });
    }

    return sources;
  }

  if (usedLexicalFallback && fallbackItems.length) {
    const seen = new Set<string>();
    const sources: KnowledgeSourceRef[] = [];
    for (const item of fallbackItems) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      sources.push({
        knowledge_base_id: item.id,
        title: item.title?.trim() || 'Bilgi Bankası',
        chunk_index: null,
        line_start: null,
        heading: null,
      });
    }
    return sources;
  }

  return [];
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
  chunks: RetrievedKnowledgeChunk[],
  meta?: {
    topic?: string | null;
    topicChanged?: boolean;
    resolvedQuestion?: string | null;
    rerankBefore?: number;
    rerankAfter?: number;
  }
): void {
  const q = query.slice(0, 40);
  const topic = meta?.topic?.trim() ? meta.topic.trim().slice(0, 40) : '';
  const resolved = meta?.resolvedQuestion?.trim()
    ? meta.resolvedQuestion.trim().slice(0, 50)
    : '';
  const changed = meta?.topicChanged === true;
  const top = chunks
    .slice(0, 3)
    .map((c) => `${c.heading ?? '—'}:${c.combined_score.toFixed(2)}`)
    .join(', ');
  const strong = hasStrongRetrievalMatch(chunks);
  const rerankPart =
    meta?.rerankBefore !== undefined && meta?.rerankAfter !== undefined
      ? ` rerank=${meta.rerankBefore}->${meta.rerankAfter}`
      : '';
  console.log(
    `[RAG] q="${q}" topic="${topic}" changed=${changed} resolved="${resolved}" texts=${texts.length} top=[${top}]${rerankPart} strong=${strong}`
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

async function countReadyDocumentsImpl(
  companyId: string,
  knowledgeBaseIds?: string[] | null
): Promise<number> {
  let query = adminClient
    .from('knowledge_documents')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('index_status', 'ready');

  if (knowledgeBaseIds?.length) {
    query = query.in('knowledge_base_id', knowledgeBaseIds);
  }

  const { count } = await query;
  return count ?? 0;
}

/** True when every ready document was embedded with the current config model */
async function isCompanyVectorIndexReadyImpl(
  companyId: string,
  knowledgeBaseIds?: string[] | null
): Promise<boolean> {
  let query = adminClient
    .from('knowledge_documents')
    .select('embedding_model')
    .eq('company_id', companyId)
    .eq('index_status', 'ready');

  if (knowledgeBaseIds?.length) {
    query = query.in('knowledge_base_id', knowledgeBaseIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.length) return false;

  const currentModel = config.rag.embeddingModel;
  return data.every((row) => row.embedding_model === currentModel);
}

async function queryKnowledgeChunksRaw(
  companyId: string,
  queryText: string,
  embedding: number[],
  knowledgeBaseIds?: string[] | null
): Promise<RetrievedKnowledgeChunk[]> {
  const { data, error } = await knowledgeRetrievalDeps.matchKnowledgeChunksRpc(
    companyId,
    queryText,
    embedding,
    knowledgeBaseIds
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
  embeddings: number[][],
  knowledgeBaseIds?: string[] | null
): Promise<RetrievedKnowledgeChunk[][]> {
  const settled = await Promise.allSettled(
    texts.map((text, index) =>
      queryKnowledgeChunksRaw(companyId, text, embeddings[index] || [], knowledgeBaseIds)
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
  fallbackItems: KnowledgeItem[] = [],
  historyOrOptions: RetrievalHistoryMsg[] | KnowledgeRetrievalOptions = [],
  maybeOptions?: KnowledgeRetrievalOptions
): Promise<KnowledgeRetrievalResult> {
  const history = Array.isArray(historyOrOptions)
    ? historyOrOptions
    : historyOrOptions.history ?? [];
  const options: KnowledgeRetrievalOptions = Array.isArray(historyOrOptions)
    ? maybeOptions ?? {}
    : historyOrOptions;
  const knowledgeBaseIds = options.knowledgeBaseIds ?? null;

  const trimmed = query.trim();
  if (!trimmed) {
    return {
      context: '',
      chunks: [],
      usedRag: false,
      usedLexicalFallback: false,
      fallbackItems,
      kbHasNoMatch: false,
      topic: '',
      resolvedQuestion: '',
      topicChanged: false,
      dependsOnHistory: false,
    };
  }

  const readyCount = await knowledgeRetrievalDeps.countReadyDocuments(
    companyId,
    knowledgeBaseIds
  );
  if (!readyCount) {
    return {
      context: '',
      chunks: [],
      usedRag: false,
      usedLexicalFallback: false,
      fallbackItems,
      kbHasNoMatch: fallbackItems.length > 0,
      topic: '',
      resolvedQuestion: trimmed,
      topicChanged: false,
      dependsOnHistory: false,
    };
  }

  const vectorIndexReady = await knowledgeRetrievalDeps.isCompanyVectorIndexReady(
    companyId,
    knowledgeBaseIds
  );
  const rewrite = await knowledgeRetrievalDeps.expandQueryForRetrieval(
    companyId,
    trimmed,
    history
  );

  const topicMeta = {
    topic: rewrite.topic || '',
    resolvedQuestion: rewrite.resolvedQuestion || trimmed,
    topicChanged: rewrite.topicChanged === true,
    dependsOnHistory: rewrite.dependsOnHistory === true,
  };

  if (!vectorIndexReady) {
    console.warn(
      `[RAG] Company ${companyId} has ready docs with stale/mixed embedding model — lexical fallback`
    );
    return {
      ...buildLexicalFallbackResult(
        fallbackItems,
        topicMeta.resolvedQuestion || trimmed,
        rewrite.isBroad
      ),
      ...topicMeta,
    };
  }

  const texts = buildRetrievalTexts(trimmed, rewrite.variants, rewrite.intentVariant, {
    resolvedQuestion: rewrite.resolvedQuestion,
    topic: rewrite.topic || null,
  });

  try {
    const embeddings = await knowledgeRetrievalDeps.createEmbeddings(texts);
    const resultSets = await queryAllVariantChunks(
      companyId,
      texts,
      embeddings,
      knowledgeBaseIds
    );
    const merged = filterChunksByKnowledgeBaseIds(
      mergeRetrievalChunksByMax(resultSets),
      knowledgeBaseIds
    );
    const finalized = finalizeRetrievalChunks(merged);
    const rerankBefore = finalized.length;

    const reranked = await knowledgeRetrievalDeps.rerankChunks(
      companyId,
      topicMeta.resolvedQuestion,
      rewrite.topic || null,
      finalized
    );
    const chunks = filterChunksByKnowledgeBaseIds(reranked.kept, knowledgeBaseIds);

    logRetrievalDiagnostics(trimmed, texts, chunks, {
      topic: topicMeta.topic,
      topicChanged: topicMeta.topicChanged,
      resolvedQuestion: topicMeta.resolvedQuestion,
      rerankBefore,
      rerankAfter: chunks.length,
    });

    if (!chunks.length) {
      return {
        context: '',
        chunks: [],
        usedRag: true,
        usedLexicalFallback: false,
        fallbackItems,
        kbHasNoMatch: true,
        ...topicMeta,
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
      ...topicMeta,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[RAG] Embedding retrieval failed, lexical fallback:', message);
    return {
      ...buildLexicalFallbackResult(
        fallbackItems,
        topicMeta.resolvedQuestion || trimmed,
        rewrite.isBroad
      ),
      ...topicMeta,
    };
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
