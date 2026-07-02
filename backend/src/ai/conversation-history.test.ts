import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOlderMessagesSummary,
  prepareConversationHistoryForChat,
} from './conversation-history.service';

describe('conversation-history.service', () => {
  it('keeps all messages when under the history limit', () => {
    const messages = [
      { sender_type: 'customer', message: 'Merhaba' },
      { sender_type: 'ai', message: 'Size nasıl yardımcı olabilirim?' },
    ];
    const prepared = prepareConversationHistoryForChat(messages, 'Fiyat nedir?', {
      maxMessages: 14,
      messageMaxChars: 300,
    });
    assert.equal(prepared.length, 2);
    assert.equal(prepared[0].message, 'Merhaba');
  });

  it('summarizes older messages and keeps last 12 verbatim', () => {
    const messages = Array.from({ length: 16 }, (_, i) => ({
      sender_type: i % 2 === 0 ? 'customer' : 'ai',
      message: `mesaj-${i + 1}`,
    }));
    messages[0] = { sender_type: 'ai', message: 'Ad ve soyadınızı yazar mısınız?' };
    messages[1] = { sender_type: 'customer', message: 'Ali Yılmaz' };
    messages[2] = { sender_type: 'ai', message: 'Cep telefon numaranızı yazar mısınız?' };
    messages[3] = { sender_type: 'customer', message: '05551234567' };
    messages[4] = { sender_type: 'ai', message: 'Hangi konu için randevu almak istiyorsunuz?' };
    messages[5] = { sender_type: 'customer', message: 'Teknik destek' };

    const prepared = prepareConversationHistoryForChat(messages, 'onaylıyorum', {
      maxMessages: 14,
      recentKeep: 12,
      messageMaxChars: 300,
    });

    assert.equal(prepared.length, 13);
    assert.equal(prepared[0].sender_type, 'assistant');
    assert.match(prepared[0].message, /Önceki konuşma özeti/);
    assert.match(prepared[0].message, /Ali Yılmaz/);
    assert.ok(prepared.some((m) => m.message === 'Teknik destek'));
    assert.equal(prepared[prepared.length - 1].message, 'mesaj-16');
  });

  it('buildOlderMessagesSummary extracts appointment fields and last intent', () => {
    const older = [
      { sender_type: 'ai', message: 'Ad soyadınız?' },
      { sender_type: 'customer', message: 'Ayşe Demir' },
      { sender_type: 'ai', message: 'Telefon?' },
      { sender_type: 'customer', message: '05559876543' },
      { sender_type: 'customer', message: 'Yarın saat 14 için randevu istiyorum' },
    ];
    const summary = buildOlderMessagesSummary(older, 'tamam');
    assert.match(summary, /Ad: Ayşe Demir/);
    assert.match(summary, /Tel: 905559876543/);
    assert.match(summary, /Son niyet: Yarın saat 14 için randevu istiyorum/);
  });

  it('trims individual messages to max char limit', () => {
    const long = 'A'.repeat(400);
    const prepared = prepareConversationHistoryForChat(
      [{ sender_type: 'customer', message: long }],
      'kısa',
      { maxMessages: 14, messageMaxChars: 300 }
    );
    assert.equal(prepared[0].message.length, 300);
  });
});
