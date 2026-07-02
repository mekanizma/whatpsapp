/**
 * Hybrid knowledge retrieval — pgvector + full-text search (embedding-first)
 */

import { config } from '../config';
import { adminClient } from '../database/supabase';
import { createEmbedding } from './embedding.service';
import { expandQueryForRetrieval } from './query-expansion.service';
import {
  buildKnowledgeContextForAI,
  filterRelevantKnowledge,
} from '../ai/knowledge-filter.service';
import type { KnowledgeItem, RetrievedKnowledgeChunk } from '../types';

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

async function queryKnowledgeChunks(
  companyId: string,
  query: string,
  embedding: number[]
): Promise<RetrievedKnowledgeChunk[]> {
  const { data, error } = await adminClient.rpc('match_knowledge_chunks', {
    p_company_id: companyId,
    query_embedding: embedding,
    query_text: query,
    match_count: config.rag.topK,
    match_threshold: config.rag.matchThreshold,
    vector_weight: config.rag.vectorWeight,
    text_weight: config.rag.textWeight,
  });

  if (error) {
    throw new Error(error.message);
  }

  return finalizeRetrievalChunks((data || []) as RetrievedKnowledgeChunk[]);
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

  try {
    const embedding = await createEmbedding(rewrite.embeddingText);
    const chunks = await queryKnowledgeChunks(companyId, rewrite.embeddingText, embedding);

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

    return {
      context: buildContextFromChunks(chunks),
      chunks,
      usedRag: true,
      usedLexicalFallback: false,
      fallbackItems,
      kbHasNoMatch: false,
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
