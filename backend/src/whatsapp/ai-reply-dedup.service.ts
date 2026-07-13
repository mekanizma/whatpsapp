/**
 * AI yanıt dedup — tenant + telefon + metin hash, TTL'li in-memory
 */

import crypto from 'crypto';
import { TRANSFER_MARKER } from '../ai/system-prompt';
import { messagingPolicyConfig } from '../config/messaging-policy.config';

const dedupCache = new Map<string, number>();

export function normalizeDedupText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildDedupKey(tenantId: string, phone: string, text: string): string {
  const hash = crypto.createHash('sha1').update(normalizeDedupText(text)).digest('hex');
  return `${tenantId}:${phone}:${hash}`;
}

export function isDedupExempt(options: {
  text: string;
  shouldTransfer?: boolean;
  isTransferredInfo?: boolean;
}): boolean {
  if (options.shouldTransfer) return true;
  if (options.isTransferredInfo) return true;
  if (options.text.includes(TRANSFER_MARKER)) return true;
  return false;
}

export function shouldSkipDedupReply(key: string, now = Date.now()): boolean {
  const expiresAt = dedupCache.get(key);
  if (!expiresAt) return false;
  if (now > expiresAt) {
    dedupCache.delete(key);
    return false;
  }
  return true;
}

export function markDedupReplySent(
  key: string,
  ttlMs = messagingPolicyConfig.dedupTtlMs,
  now = Date.now()
): void {
  dedupCache.set(key, now + ttlMs);
}

/** Test / ticket kapanışı için */
export function clearDedupForConversation(tenantId: string, phone: string): void {
  const prefix = `${tenantId}:${phone}:`;
  for (const key of dedupCache.keys()) {
    if (key.startsWith(prefix)) dedupCache.delete(key);
  }
}

/** Test yardımcısı */
export function _resetDedupCacheForTests(): void {
  dedupCache.clear();
}
