import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getConversationState,
  markConversationTransferred,
  markTransferredWaitingMessageSent,
  incrementDedupSkipCount,
  resetDedupSkipCount,
  _resetConversationStateForTests,
} from './conversation-state.service';
import { messagingPolicyConfig } from '../config/messaging-policy.config';

describe('conversation-state', () => {
  const tenant = 'company-1';
  const phone = '905551112233';

  beforeEach(() => {
    _resetConversationStateForTests();
  });

  it('starts active with zero dedup skip count', () => {
    const state = getConversationState(tenant, phone);
    assert.equal(state.status, 'active');
    assert.equal(state.dedupSkipCount, 0);
  });

  it('tracks transferred state and waiting message flag', () => {
    markConversationTransferred(tenant, phone, 1000);
    let state = getConversationState(tenant, phone, 2000);
    assert.equal(state.status, 'transferred');
    assert.equal(state.waitingMessageSent, false);

    markTransferredWaitingMessageSent(tenant, phone);
    state = getConversationState(tenant, phone, 3000);
    assert.equal(state.waitingMessageSent, true);
  });

  it('resets transferred state after TTL', () => {
    const ttl = messagingPolicyConfig.transferredStateTtlMs;
    markConversationTransferred(tenant, phone, 1000);
    const expired = getConversationState(tenant, phone, 1000 + ttl + 1);
    assert.equal(expired.status, 'active');
    assert.equal(expired.dedupSkipCount, 0);
  });

  it('increments and resets dedup skip count', () => {
    assert.equal(incrementDedupSkipCount(tenant, phone), 1);
    assert.equal(incrementDedupSkipCount(tenant, phone), 2);
    resetDedupSkipCount(tenant, phone);
    assert.equal(getConversationState(tenant, phone).dedupSkipCount, 0);
  });
});
