/**
 * RAG + anahtar kelime filtresi sonuçlarını birleştirir
 */

import { config } from '../config';
import type { KnowledgeItem } from '../types';
import type { KnowledgeRetrievalResult } from './knowledge-retrieval.service';
import type { KnowledgeFilterResult } from '../ai/knowledge-filter.service';
import {
  buildMandatoryKnowledgeContext,
  isPriceQuery,
} from '../ai/knowledge-filter.service';

function parseSections(context: string): Map<string, string> {
  const sections = new Map<string, string>();
  if (!context.trim()) return sections;

  const parts = context.split(/^### /m).filter(Boolean);
  for (const part of parts) {
    const newline = part.indexOf('\n');
    if (newline === -1) {
      sections.set(part.trim().toLowerCase(), `### ${part.trim()}`);
      continue;
    }
    const title = part.slice(0, newline).trim();
    sections.set(title.toLowerCase(), `### ${part.trim()}`);
  }
  return sections;
}

function mergeSectionContexts(primary: string, secondary: string): string {
  const merged = parseSections(primary);
  for (const [key, section] of parseSections(secondary)) {
    if (!merged.has(key)) {
      merged.set(key, section);
    }
  }

  let context = [...merged.values()].join('\n\n');
  if (context.length > config.rag.maxContextChars) {
    context = `${context.slice(0, config.rag.maxContextChars)}\n...[kısaltıldı]`;
  }
  return context;
}

function contextIncludesPriceInfo(context: string): boolean {
  return /fiyat|ücret|ucret|price/i.test(context) || /\d+\s*(tl|₺|try)/i.test(context);
}

/**
 * RAG chunk'ları ile keyword filtresini birleştir.
 * Fiyat gibi konularda RAG yanlış chunk getirdiğinde keyword filtresi devreye girer.
 */
export function resolveKnowledgeContextForAI(
  retrieval: KnowledgeRetrievalResult,
  kbFilter: KnowledgeFilterResult,
  allItems: KnowledgeItem[],
  customerMessage: string
): string {
  const keywordContext = buildMandatoryKnowledgeContext(allItems, customerMessage, kbFilter);

  if (!retrieval.usedRag || !retrieval.context.trim()) {
    return keywordContext || retrieval.context;
  }

  if (kbFilter.isBroadQuery) {
    return retrieval.context;
  }

  if (!kbFilter.hasRelevantContent || !keywordContext.trim()) {
    return retrieval.context;
  }

  if (isPriceQuery(customerMessage) && !contextIncludesPriceInfo(retrieval.context)) {
    return mergeSectionContexts(retrieval.context, keywordContext);
  }

  if (!isPriceQuery(customerMessage)) {
    return mergeSectionContexts(retrieval.context, keywordContext);
  }

  return mergeSectionContexts(retrieval.context, keywordContext);
}
