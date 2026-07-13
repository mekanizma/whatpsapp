/**
 * Konuşma durumu — active | transferred + dedupSkipCount
 * In-memory, TTL ile transferred → active dönüşü
 */

import { messagingPolicyConfig } from '../config/messaging-policy.config';

export type ConversationLifecycleStatus = 'active' | 'transferred';

export interface ConversationState {
  status: ConversationLifecycleStatus;
  dedupSkipCount: number;
  transferredAt?: number;
  waitingMessageSent?: boolean;
}

const stateMap = new Map<string, ConversationState>();

function stateKey(tenantId: string, phone: string): string {
  return `${tenantId}:${phone}`;
}

function freshState(): ConversationState {
  return { status: 'active', dedupSkipCount: 0 };
}

function isTransferredExpired(state: ConversationState, now: number): boolean {
  if (state.status !== 'transferred' || !state.transferredAt) return false;
  return now - state.transferredAt > messagingPolicyConfig.transferredStateTtlMs;
}

export function getConversationState(
  tenantId: string,
  phone: string,
  now = Date.now()
): ConversationState {
  const key = stateKey(tenantId, phone);
  const existing = stateMap.get(key);
  if (!existing) return freshState();

  if (isTransferredExpired(existing, now)) {
    console.log(
      `[WhatsApp] State geçişi: transferred → active (TTL) → ${tenantId}:${phone}`
    );
    stateMap.delete(key);
    return freshState();
  }

  return { ...existing };
}

export function markConversationTransferred(
  tenantId: string,
  phone: string,
  now = Date.now()
): void {
  const key = stateKey(tenantId, phone);
  const prev = stateMap.get(key);
  stateMap.set(key, {
    status: 'transferred',
    dedupSkipCount: 0,
    transferredAt: now,
    waitingMessageSent: prev?.waitingMessageSent ?? false,
  });
  console.log(`[WhatsApp] State geçişi: active → transferred → ${tenantId}:${phone}`);
}

export function markTransferredWaitingMessageSent(tenantId: string, phone: string): void {
  const key = stateKey(tenantId, phone);
  const existing = stateMap.get(key) ?? freshState();
  stateMap.set(key, {
    ...existing,
    status: 'transferred',
    waitingMessageSent: true,
    transferredAt: existing.transferredAt ?? Date.now(),
  });
}

export function incrementDedupSkipCount(
  tenantId: string,
  phone: string,
  now = Date.now()
): number {
  const key = stateKey(tenantId, phone);
  const existing = getConversationState(tenantId, phone, now);
  const next = existing.dedupSkipCount + 1;
  stateMap.set(key, { ...existing, dedupSkipCount: next });
  return next;
}

export function resetDedupSkipCount(tenantId: string, phone: string, now = Date.now()): void {
  const key = stateKey(tenantId, phone);
  const existing = getConversationState(tenantId, phone, now);
  if (existing.dedupSkipCount === 0) return;
  stateMap.set(key, { ...existing, dedupSkipCount: 0 });
}

export function clearConversationState(tenantId: string, phone: string): void {
  stateMap.delete(stateKey(tenantId, phone));
}

/** Test yardımcısı */
export function _resetConversationStateForTests(): void {
  stateMap.clear();
}
