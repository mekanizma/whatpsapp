/**
 * Knowledge Search Service — çok dilli semantik RAG arama
 * Keyword/LIKE arama yok; yalnızca embedding + cosine similarity
 */

import { config } from '../config';
import { adminClient } from '../database/supabase';
import { createEmbedding } from './embedding.service';
import {
  analyzeQueryForSearch,
  buildSearchEmbeddingText,
  type QueryAnalysis,
} from './query-analysis.service';
import type { RetrievedKnowledgeChunk } from '../types';

export interface KnowledgeSearchResult {
  context: string;
  chunks: RetrievedKnowledgeChunk[];
  usedSemanticSearch: boolean;
  kbHasNoMatch: boolean;
  kbEmpty: boolean;
  topSimilarity: number;
  analysis: QueryAnalysis | null;
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

async function hasReadyIndex(companyId: string): Promise<boolean> {
  const { count } = await adminClient
    .from('knowledge_documents')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('index_status', 'ready');

  return (count ?? 0) > 0;
}

async function semanticSearch(
  companyId: string,
  embedding: number[]
): Promise<RetrievedKnowledgeChunk[]> {
  const { data, error } = await adminClient.rpc('match_knowledge_chunks', {
    p_company_id: companyId,
    query_embedding: embedding,
    query_text: null,
    match_count: config.rag.topK,
    match_threshold: config.rag.matchThreshold,
    vector_weight: 1.0,
    text_weight: 0.0,
  });

  if (error) {
    throw new Error(error.message);
  }

  return ((data || []) as RetrievedKnowledgeChunk[])
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, config.rag.topK);
}

/**
 * Kullanıcı mesajı için semantik bilgi bankası araması yapar.
 * 1. Dil/niyet/kavram analizi
 * 2. Embedding oluşturma
 * 3. Cosine similarity ile en alakalı chunk'ları getirme
 */
export async function searchKnowledge(
  companyId: string,
  userMessage: string
): Promise<KnowledgeSearchResult> {
  const trimmed = userMessage.trim();
  const emptyResult: KnowledgeSearchResult = {
    context: '',
    chunks: [],
    usedSemanticSearch: false,
    kbHasNoMatch: false,
    kbEmpty: true,
    topSimilarity: 0,
    analysis: null,
  };

  if (!trimmed) return emptyResult;

  const indexReady = await hasReadyIndex(companyId);
  if (!indexReady) {
    return {
      ...emptyResult,
      kbEmpty: false,
      kbHasNoMatch: true,
    };
  }

  try {
    const analysis = await analyzeQueryForSearch(trimmed);
    const embeddingText = buildSearchEmbeddingText(trimmed, analysis);
    const embedding = await createEmbedding(embeddingText);
    const chunks = await semanticSearch(companyId, embedding);

    const topSimilarity = chunks[0]?.similarity ?? 0;

    if (!chunks.length || topSimilarity < config.rag.matchThreshold) {
      return {
        context: '',
        chunks: [],
        usedSemanticSearch: true,
        kbHasNoMatch: true,
        kbEmpty: false,
        topSimilarity,
        analysis,
      };
    }

    return {
      context: buildContextFromChunks(chunks),
      chunks,
      usedSemanticSearch: true,
      kbHasNoMatch: false,
      kbEmpty: false,
      topSimilarity,
      analysis,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[KnowledgeSearch] Semantic search failed:', message);
    return {
      context: '',
      chunks: [],
      usedSemanticSearch: false,
      kbHasNoMatch: true,
      kbEmpty: false,
      topSimilarity: 0,
      analysis: null,
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
