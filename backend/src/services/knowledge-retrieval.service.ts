/**
 * Hybrid knowledge retrieval — pgvector + full-text search
 */

import { config } from '../config';
import { adminClient } from '../database/supabase';
import { createEmbedding } from './embedding.service';
import { expandQueryForRetrieval } from './query-expansion.service';
import type { KnowledgeItem, RetrievedKnowledgeChunk } from '../types';

export interface KnowledgeRetrievalResult {
  context: string;
  chunks: RetrievedKnowledgeChunk[];
  usedRag: boolean;
  fallbackItems: KnowledgeItem[];
  /** İndeks hazır ama sorguya uygun chunk bulunamadı */
  kbHasNoMatch: boolean;
}

function buildContextFromChunks(chunks: RetrievedKnowledgeChunk[]): string {
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

function formatFallbackKnowledge(items: KnowledgeItem[]): string {
  if (!items.length) return '';
  const text = items.map((k) => `### ${k.title}\n${k.content}`).join('\n\n');
  return text.length > config.rag.maxContextChars
    ? `${text.slice(0, config.rag.maxContextChars)}\n...[kısaltıldı]`
    : text;
}

export async function retrieveKnowledgeContext(
  companyId: string,
  query: string,
  fallbackItems: KnowledgeItem[] = []
): Promise<KnowledgeRetrievalResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      context: formatFallbackKnowledge(fallbackItems),
      chunks: [],
      usedRag: false,
      fallbackItems,
      kbHasNoMatch: false,
    };
  }

  const { count: readyCount } = await adminClient
    .from('knowledge_documents')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('index_status', 'ready');

  if (!readyCount) {
    return {
      context: formatFallbackKnowledge(fallbackItems),
      chunks: [],
      usedRag: false,
      fallbackItems,
      kbHasNoMatch: false,
    };
  }

  try {
    const searchQuery = expandQueryForRetrieval(trimmed);
    const embedding = await createEmbedding(searchQuery);

    const { data, error } = await adminClient.rpc('match_knowledge_chunks', {
      p_company_id: companyId,
      query_embedding: embedding,
      query_text: searchQuery,
      match_count: config.rag.topK,
      match_threshold: config.rag.matchThreshold,
      vector_weight: config.rag.vectorWeight,
      text_weight: config.rag.textWeight,
    });

    if (error) {
      console.error('[RAG] Retrieval RPC error:', error.message);
      return {
        context: formatFallbackKnowledge(fallbackItems),
        chunks: [],
        usedRag: false,
        fallbackItems,
        kbHasNoMatch: true,
      };
    }

    const chunks = ((data || []) as RetrievedKnowledgeChunk[])
      .sort((a, b) => b.combined_score - a.combined_score)
      .slice(0, config.rag.topK);

    if (!chunks.length) {
      return {
        context: formatFallbackKnowledge(fallbackItems),
        chunks: [],
        usedRag: false,
        fallbackItems,
        kbHasNoMatch: true,
      };
    }

    return {
      context: buildContextFromChunks(chunks),
      chunks,
      usedRag: true,
      fallbackItems,
      kbHasNoMatch: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[RAG] Retrieval failed:', message);
    return {
      context: formatFallbackKnowledge(fallbackItems),
      chunks: [],
      usedRag: false,
      fallbackItems,
      kbHasNoMatch: true,
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
