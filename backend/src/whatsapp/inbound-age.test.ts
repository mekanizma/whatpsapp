import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INBOUND_MAX_AGE_SEC,
  getBaileysMessageTimestampSec,
  isRecentInboundMessage,
  parseWebhookMessageTimestampSec,
} from './message.handler';
import type { WAMessage } from '@whiskeysockets/baileys';

describe('inbound message age filter', () => {
  it('accepts messages within max age window', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    assert.equal(isRecentInboundMessage(nowSec - 120), true);
    assert.equal(isRecentInboundMessage(nowSec - INBOUND_MAX_AGE_SEC + 1), true);
  });

  it('rejects old or missing timestamps', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    assert.equal(isRecentInboundMessage(nowSec - INBOUND_MAX_AGE_SEC - 1), false);
    assert.equal(isRecentInboundMessage(null), false);
    assert.equal(isRecentInboundMessage(nowSec + 600), false);
  });

  it('parses Baileys seconds and millisecond timestamps', () => {
    const msgSec = { messageTimestamp: 1_700_000_000 } as WAMessage;
    const msgMs = { messageTimestamp: 1_700_000_000_000 } as WAMessage;
    assert.equal(getBaileysMessageTimestampSec(msgSec), 1_700_000_000);
    assert.equal(getBaileysMessageTimestampSec(msgMs), 1_700_000_000);
  });

  it('parses Cloud API webhook timestamp strings', () => {
    assert.equal(parseWebhookMessageTimestampSec('1700000000'), 1_700_000_000);
    assert.equal(parseWebhookMessageTimestampSec(undefined), null);
  });
});
