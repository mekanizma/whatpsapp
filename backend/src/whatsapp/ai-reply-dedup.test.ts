import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDedupKey,
  normalizeDedupText,
  shouldSkipDedupReply,
  markDedupReplySent,
  isDedupExempt,
  _resetDedupCacheForTests,
} from './ai-reply-dedup.service';
import { TRANSFER_MARKER } from '../ai/system-prompt';

describe('ai-reply-dedup', () => {
  beforeEach(() => {
    _resetDedupCacheForTests();
  });

  it('normalizes text for dedup hash', () => {
    assert.equal(normalizeDedupText('  Merhaba   Dünya  '), 'merhaba dünya');
  });

  it('skips duplicate within TTL for same tenant+phone', () => {
    const key = buildDedupKey('tenant-a', '905551112233', 'Aynı yanıt metni');
    markDedupReplySent(key, 60_000);
    assert.equal(shouldSkipDedupReply(key), true);
  });

  it('does not skip for different phones with same text', () => {
    const keyA = buildDedupKey('tenant-a', '905551112233', 'Aynı yanıt');
    const keyB = buildDedupKey('tenant-a', '905559998877', 'Aynı yanıt');
    markDedupReplySent(keyA, 60_000);
    assert.equal(shouldSkipDedupReply(keyA), true);
    assert.equal(shouldSkipDedupReply(keyB), false);
  });

  it('allows resend after TTL expires', () => {
    const key = buildDedupKey('tenant-a', '905551112233', 'TTL test');
    const now = 1_000_000;
    markDedupReplySent(key, 60_000, now);
    assert.equal(shouldSkipDedupReply(key, now + 30_000), true);
    assert.equal(shouldSkipDedupReply(key, now + 61_000), false);
  });

  it('exempts transfer marker and shouldTransfer replies', () => {
    assert.equal(isDedupExempt({ text: `Yanıt ${TRANSFER_MARKER}`, shouldTransfer: false }), true);
    assert.equal(isDedupExempt({ text: 'Normal yanıt', shouldTransfer: true }), true);
    assert.equal(isDedupExempt({ text: 'Normal yanıt', isTransferredInfo: true }), true);
    assert.equal(isDedupExempt({ text: 'Normal yanıt' }), false);
  });
});
