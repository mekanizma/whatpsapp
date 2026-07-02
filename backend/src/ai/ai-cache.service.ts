/**
 * AI yanıt önbelleği — bellek + Supabase (şirket bazlı izolasyon, SHA-256 anahtar)
 */

import { createHash } from 'crypto';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { normalizeForCache } from './ai-gate.service';
import type { HistoryMsg } from './appointment-collect.service';
import { parseCollectedFields } from './appointment-collect.service';

interface CacheEntry {
  response: string;
  shouldTransfer: boolean;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry>();

const PHONE_IN_TEXT_RE =
  /(?:\+?90|0)?[\s-]?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\b\d{10,15}\b/;

export function hashNormalizedMessage(message: string): string {
  const normalized = normalizeForCache(message);
  return createHash('sha256').update(normalized).digest('hex');
}

function memoryKey(companyId: string, messageHash: string): string {
  return `${companyId}:${messageHash}`;
}

function isExpired(entry: CacheEntry): boolean {
  return Date.now() > entry.expiresAt;
}

export function extractConversationPersonNames(
  history: HistoryMsg[],
  latestMessage: string
): string[] {
  const collected = parseCollectedFields(history, latestMessage);
  const names: string[] = [];

  if (collected.customer_name?.trim()) names.push(collected.customer_name.trim());
  if (collected.doctor_name?.trim()) names.push(collected.doctor_name.trim());

  for (const m of history) {
    if (m.sender_type !== 'customer') continue;
    const text = m.message.trim();
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;
    if (parts.every((p) => p.length >= 2 && /^[\p{L}'-]+$/u.test(p))) {
      names.push(text);
    }
  }

  return [...new Set(names.map((n) => n.toLocaleLowerCase('tr')))].filter((n) => n.length >= 4);
}

export function responseContainsPhoneNumber(text: string): boolean {
  return PHONE_IN_TEXT_RE.test(text);
}

export function responseContainsPersonName(text: string, names: string[]): boolean {
  if (!names.length) return false;
  const lower = text.toLocaleLowerCase('tr');
  return names.some((name) => lower.includes(name));
}

/** Yanıt önbelleğe yazılabilir mi — randevu/transfer/kişisel veri hariç */
export function shouldCacheResponse(options: {
  appointmentMode: boolean;
  shouldTransfer: boolean;
  response: string;
  history: HistoryMsg[];
  latestMessage: string;
}): boolean {
  if (!config.ai.cacheEnabled) return false;
  if (options.appointmentMode) return false;
  if (options.shouldTransfer) return false;
  if (!options.response.trim()) return false;

  const names = extractConversationPersonNames(options.history, options.latestMessage);
  if (responseContainsPhoneNumber(options.response)) return false;
  if (responseContainsPersonName(options.response, names)) return false;

  return normalizeForCache(options.latestMessage).length >= 10;
}

async function readPersistedResponse(
  companyId: string,
  messageHash: string
): Promise<CacheEntry | null> {
  if (config.demoMode) return null;

  const { data, error } = await adminClient
    .from('ai_response_cache')
    .select('response, should_transfer, expires_at')
    .eq('company_id', companyId)
    .eq('normalized_message_hash', messageHash)
    .maybeSingle();

  if (error || !data) return null;

  const expiresAt = new Date(String(data.expires_at)).getTime();
  if (Number.isNaN(expiresAt) || Date.now() > expiresAt) {
    void adminClient
      .from('ai_response_cache')
      .delete()
      .eq('company_id', companyId)
      .eq('normalized_message_hash', messageHash);
    return null;
  }

  return {
    response: String(data.response),
    shouldTransfer: data.should_transfer === true,
    expiresAt,
  };
}

async function writePersistedResponse(
  companyId: string,
  messageHash: string,
  response: string,
  shouldTransfer: boolean,
  expiresAt: number
): Promise<void> {
  if (config.demoMode) return;

  const { error } = await adminClient.from('ai_response_cache').upsert(
    {
      company_id: companyId,
      normalized_message_hash: messageHash,
      response,
      should_transfer: shouldTransfer,
      expires_at: new Date(expiresAt).toISOString(),
    },
    { onConflict: 'company_id,normalized_message_hash' }
  );

  if (error) {
    console.error('[AI Cache] Persist failed:', error.message);
  }
}

export async function getCachedResponse(
  companyId: string,
  message: string
): Promise<{ message: string; shouldTransfer: boolean } | null> {
  if (!config.ai.cacheEnabled) return null;

  const messageHash = hashNormalizedMessage(message);
  const key = memoryKey(companyId, messageHash);

  const mem = memoryCache.get(key);
  if (mem && !isExpired(mem)) {
    return { message: mem.response, shouldTransfer: mem.shouldTransfer };
  }
  if (mem) memoryCache.delete(key);

  const persisted = await readPersistedResponse(companyId, messageHash);
  if (!persisted) return null;

  memoryCache.set(key, persisted);
  trimMemoryCache();
  return { message: persisted.response, shouldTransfer: persisted.shouldTransfer };
}

export async function setCachedResponse(
  companyId: string,
  message: string,
  response: string,
  shouldTransfer: boolean
): Promise<void> {
  if (!config.ai.cacheEnabled) return;
  if (normalizeForCache(message).length < 10) return;

  const messageHash = hashNormalizedMessage(message);
  const key = memoryKey(companyId, messageHash);
  const expiresAt = Date.now() + config.ai.cacheTtlMs;

  const entry: CacheEntry = { response, shouldTransfer, expiresAt };
  memoryCache.set(key, entry);
  trimMemoryCache();

  void writePersistedResponse(companyId, messageHash, response, shouldTransfer, expiresAt);
}

function trimMemoryCache(): void {
  if (memoryCache.size <= 500) return;
  const oldest = memoryCache.keys().next().value;
  if (oldest) memoryCache.delete(oldest);
}

export async function clearCompanyCache(companyId: string): Promise<void> {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(`${companyId}:`)) memoryCache.delete(key);
  }

  if (config.demoMode) return;

  const { error } = await adminClient
    .from('ai_response_cache')
    .delete()
    .eq('company_id', companyId);

  if (error) {
    console.error('[AI Cache] Company clear failed:', error.message);
  }
}

export async function clearAllResponseCache(): Promise<void> {
  memoryCache.clear();

  if (config.demoMode) return;

  const { error } = await adminClient.from('ai_response_cache').delete().neq('normalized_message_hash', '');

  if (error) {
    console.error('[AI Cache] Global clear failed:', error.message);
  }
}

export async function cleanupExpiredResponseCache(): Promise<number> {
  for (const [key, entry] of memoryCache.entries()) {
    if (isExpired(entry)) memoryCache.delete(key);
  }

  if (config.demoMode) return 0;

  const { data, error } = await adminClient
    .from('ai_response_cache')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    console.error('[AI Cache] Expired cleanup failed:', error.message);
    return 0;
  }

  return data?.length ?? 0;
}

let cleanupTimer: NodeJS.Timeout | null = null;

/** Günlük süresi dolmuş önbellek temizliği */
export function startResponseCacheCleanupSchedule(): void {
  if (cleanupTimer || config.demoMode) return;

  const run = () => {
    void cleanupExpiredResponseCache().then((removed) => {
      if (removed > 0) {
        console.log(`[AI Cache] ${removed} expired row(s) removed`);
      }
    });
  };

  run();
  cleanupTimer = setInterval(run, 24 * 60 * 60 * 1000);
  cleanupTimer.unref();
}

// --- Query rewrite cache (in-memory only) ---

export interface QueryRewriteCacheEntry {
  variants: string[];
  isBroad: boolean;
  embeddingText: string;
}

const rewriteCache = new Map<string, QueryRewriteCacheEntry & { expiresAt: number }>();

function rewriteCacheKey(companyId: string, message: string): string {
  return `rewrite:${companyId}:${hashNormalizedMessage(message)}`;
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
  if (normalizeForCache(message).length < 3) return;

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
