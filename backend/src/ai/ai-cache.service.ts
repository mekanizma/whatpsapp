/**
 * AI yanıt önbelleği — aynı sorular için tekrar API çağrısı yapmaz
 * TTL tabanlı in-memory cache (şirket bazlı izolasyon)
 */

import { config } from '../config';
import { normalizeForCache } from './ai-gate.service';

interface CacheEntry {
  response: string;
  shouldTransfer: boolean;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(companyId: string, message: string): string {
  return `${companyId}:${normalizeForCache(message)}`;
}

export function getCachedResponse(
  companyId: string,
  message: string
): { message: string; shouldTransfer: boolean } | null {
  if (!config.ai.cacheEnabled) return null;

  const key = cacheKey(companyId, message);
  const entry = cache.get(key);

  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return { message: entry.response, shouldTransfer: entry.shouldTransfer };
}

export function setCachedResponse(
  companyId: string,
  message: string,
  response: string,
  shouldTransfer: boolean
): void {
  if (!config.ai.cacheEnabled) return;

  const normalized = normalizeForCache(message);
  if (normalized.length < 10) return; // Kısa mesajları cache'leme (çok genel)

  const key = cacheKey(companyId, message);
  cache.set(key, {
    response,
    shouldTransfer,
    expiresAt: Date.now() + config.ai.cacheTtlMs,
  });

  // Bellek sınırı: max 500 entry
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

export function clearCompanyCache(companyId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${companyId}:`)) cache.delete(key);
  }
}

export interface QueryRewriteCacheEntry {
  variants: string[];
  isBroad: boolean;
  embeddingText: string;
}

const rewriteCache = new Map<string, QueryRewriteCacheEntry & { expiresAt: number }>();

function rewriteCacheKey(companyId: string, message: string): string {
  return `rewrite:${companyId}:${normalizeForCache(message)}`;
}

export function getCachedQueryRewrite(
  companyId: string,
  message: string
): QueryRewriteCacheEntry | null {
  const key = rewriteCacheKey(companyId, message);
  const entry = rewriteCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    rewriteCache.delete(key);
    return null;
  }
  return {
    variants: entry.variants,
    isBroad: entry.isBroad,
    embeddingText: entry.embeddingText,
  };
}

export function setCachedQueryRewrite(
  companyId: string,
  message: string,
  result: QueryRewriteCacheEntry
): void {
  const normalized = normalizeForCache(message);
  if (normalized.length < 3) return;

  const key = rewriteCacheKey(companyId, message);
  rewriteCache.set(key, {
    ...result,
    expiresAt: Date.now() + config.ai.cacheTtlMs,
  });

  if (rewriteCache.size > 500) {
    const oldest = rewriteCache.keys().next().value;
    if (oldest) rewriteCache.delete(oldest);
  }
}

export function clearCompanyRewriteCache(companyId: string): void {
  for (const key of rewriteCache.keys()) {
    if (key.startsWith(`rewrite:${companyId}:`)) rewriteCache.delete(key);
  }
}
