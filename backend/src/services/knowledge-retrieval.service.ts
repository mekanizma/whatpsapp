/**
 * @deprecated knowledge-search.service kullanın — geriye dönük uyumluluk için sarmalayıcı
 */

import { searchKnowledge } from './knowledge-search.service';
import type { KnowledgeItem, RetrievedKnowledgeChunk } from '../types';

export interface KnowledgeRetrievalResult {
  context: string;
  chunks: RetrievedKnowledgeChunk[];
  usedRag: boolean;
  fallbackItems: KnowledgeItem[];
  kbHasNoMatch: boolean;
}

export async function retrieveKnowledgeContext(
  companyId: string,
  query: string,
  fallbackItems: KnowledgeItem[] = []
): Promise<KnowledgeRetrievalResult> {
  const result = await searchKnowledge(companyId, query);

  return {
    context: result.context,
    chunks: result.chunks,
    usedRag: result.usedSemanticSearch,
    fallbackItems,
    kbHasNoMatch: result.kbHasNoMatch,
  };
}

export { getKnowledgeChunkPreviews } from './knowledge-search.service';
