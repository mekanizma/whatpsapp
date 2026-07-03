import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashNormalizedMessage,
  shouldCacheResponse,
  responseContainsPhoneNumber,
  responseContainsPersonName,
  extractConversationPersonNames,
} from './ai-cache.service';
import { isKnowledgeMissAiResponse } from './knowledge-miss.service';

describe('ai-cache.service', () => {
  it('hashNormalizedMessage is stable and does not embed raw text in key format', () => {
    const a = hashNormalizedMessage('Çalışma saatleriniz nedir?');
    const b = hashNormalizedMessage('Çalışma saatleriniz nedir?');
    const c = hashNormalizedMessage('Fiyatlarınız nedir?');
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(a, /^[a-f0-9]{64}$/);
  });

  it('different tenants with same message produce same hash but isolated cache keys via companyId', () => {
    const hash = hashNormalizedMessage('Merhaba çalışma saatleri');
    assert.equal(hash, hashNormalizedMessage('Merhaba çalışma saatleri'));
    assert.notEqual(`tenant-a:${hash}`, `tenant-b:${hash}`);
  });

  it('shouldCacheResponse rejects appointment and transfer flows', () => {
    const history = [{ sender_type: 'customer', message: 'Ali Yılmaz' }];
    assert.equal(
      shouldCacheResponse({
        appointmentMode: true,
        shouldTransfer: false,
        response: 'Randevunuz alındı',
        history,
        latestMessage: 'randevu almak istiyorum',
      }),
      false
    );
    assert.equal(
      shouldCacheResponse({
        appointmentMode: false,
        shouldTransfer: true,
        response: 'Aktarıyorum',
        history,
        latestMessage: 'çalışma saatleri nedir',
      }),
      false
    );
  });

  it('shouldCacheResponse rejects responses with phone or captured names', () => {
    const history = [
      { sender_type: 'ai', message: 'Ad soyadınız?' },
      { sender_type: 'customer', message: 'Ayşe Demir' },
    ];
    assert.equal(responseContainsPhoneNumber('Bizi 0555 123 45 67 arayın'), true);
    assert.equal(
      responseContainsPersonName('Teşekkürler Ayşe Demir, kaydınız alındı', ['ayşe demir']),
      true
    );
    assert.equal(
      shouldCacheResponse({
        appointmentMode: false,
        shouldTransfer: false,
        response: 'Teşekkürler Ayşe Demir',
        history,
        latestMessage: 'çalışma saatleri',
      }),
      false
    );
  });

  it('shouldCacheResponse allows generic KB answers', () => {
    assert.equal(
      shouldCacheResponse({
        appointmentMode: false,
        shouldTransfer: false,
        response: 'Pazartesi-Cuma 09:00-18:00 arası hizmet veriyoruz.',
        history: [],
        latestMessage: 'çalışma saatleriniz nedir',
      }),
      true
    );
  });

  it('shouldCacheResponse rejects knowledge-miss responses and kbHasNoMatch', () => {
    const missResponse =
      'Bu soru için bilgi bankasında eşleşen içerik bulunamadı. Canlı temsilciye aktarmayı teklif edebilirim.';
    assert.equal(isKnowledgeMissAiResponse(missResponse), true);
    assert.equal(
      shouldCacheResponse({
        appointmentMode: false,
        shouldTransfer: false,
        response: missResponse,
        history: [],
        latestMessage: 'yurt ücreti ne kadar',
      }),
      false
    );
    assert.equal(
      shouldCacheResponse({
        appointmentMode: false,
        shouldTransfer: false,
        response: 'Kampüs adresimiz Kadıköy.',
        history: [],
        latestMessage: 'üniversite nerede',
        kbHasNoMatch: true,
      }),
      false
    );
  });

  it('extractConversationPersonNames collects parsed appointment names', () => {
    const history = [
      { sender_type: 'ai', message: 'Ad soyadınız?' },
      { sender_type: 'customer', message: 'Mehmet Kaya' },
    ];
    const names = extractConversationPersonNames(history, 'çalışma saatleri');
    assert.ok(names.includes('mehmet kaya'));
  });
});
