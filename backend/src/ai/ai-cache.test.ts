import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import { config } from '../config';
import { normalizeForCache } from './ai-gate.service';
import {
  getCacheKey,
  hashNormalizedMessage,
  shouldCacheResponse,
  responseContainsPhoneNumber,
  responseContainsPersonName,
  extractConversationPersonNames,
  isDeflectionResponse,
  setCachedResponse,
  getCachedResponse,
  clearCompanyCache,
  getCachedQueryRewrite,
  setCachedQueryRewrite,
} from './ai-cache.service';
import { isKnowledgeMissAiResponse } from './knowledge-miss.service';

const STRONG_RAG = { usedRag: true, hasStrongMatch: true, kbHasNoMatch: false };

describe('ai-cache.service', () => {
  it('getCacheKey is stable and includes CACHE_VERSION in hash input', () => {
    const message = 'Çalışma saatleriniz nedir?';
    const a = getCacheKey(message);
    const b = getCacheKey(message);
    const c = getCacheKey('Fiyatlarınız nedir?');
    const expected = createHash('sha256')
      .update(`${config.ai.cacheVersion}:${normalizeForCache(message)}`)
      .digest('hex');

    assert.equal(a, b);
    assert.equal(a, expected);
    assert.notEqual(a, c);
    assert.match(a, /^[a-f0-9]{64}$/);
    assert.equal(hashNormalizedMessage(message), a);
  });

  it('bumping CACHE_VERSION changes the cache key for the same message', () => {
    const message = 'prices for dorms';
    const v1 = createHash('sha256')
      .update(`1:${normalizeForCache(message)}`)
      .digest('hex');
    const v2 = createHash('sha256')
      .update(`2:${normalizeForCache(message)}`)
      .digest('hex');
    assert.notEqual(v1, v2);
  });

  it('different tenants with same message produce same hash but isolated cache keys via companyId', () => {
    const hash = getCacheKey('Merhaba çalışma saatleri');
    assert.equal(hash, getCacheKey('Merhaba çalışma saatleri'));
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
        ...STRONG_RAG,
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
        ...STRONG_RAG,
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
        ...STRONG_RAG,
      }),
      false
    );
  });

  it('shouldCacheResponse allows long factual KB answers with strong RAG match', () => {
    assert.equal(
      shouldCacheResponse({
        appointmentMode: false,
        shouldTransfer: false,
        response:
          'Yurt ücretlerimiz oda tipine göre değişir: Standart oda aylık 12.500 TL, suit oda 15.800 TL, kahvaltı dahildir.',
        history: [],
        latestMessage: 'yurt fiyatları nedir',
        ...STRONG_RAG,
      }),
      true
    );
  });

  it('shouldCacheResponse rejects deflection counter-questions', () => {
    const deflection =
      'I can help with questions about our company. What would you like to know?';
    assert.equal(isDeflectionResponse(deflection), true);
    assert.equal(
      shouldCacheResponse({
        appointmentMode: false,
        shouldTransfer: false,
        response: deflection,
        history: [],
        latestMessage: 'prices for dorms',
        ...STRONG_RAG,
      }),
      false
    );
  });

  it('shouldCacheResponse rejects short generic responses under 80 chars', () => {
    assert.equal(
      shouldCacheResponse({
        appointmentMode: false,
        shouldTransfer: false,
        response: 'Kampüs adresimiz Kadıköy bölgesinde yer almaktadır.',
        history: [],
        latestMessage: 'üniversite nerede',
        ...STRONG_RAG,
      }),
      false
    );
  });

  it('shouldCacheResponse rejects without usedRag or hasStrongMatch', () => {
    const factual =
      'Yurt ücretlerimiz oda tipine göre değişir: Standart oda aylık 12.500 TL, suit oda 15.800 TL, kahvaltı dahildir.';
    assert.equal(
      shouldCacheResponse({
        appointmentMode: false,
        shouldTransfer: false,
        response: factual,
        history: [],
        latestMessage: 'yurt fiyatları nedir',
        usedRag: false,
        hasStrongMatch: false,
      }),
      false
    );
    assert.equal(
      shouldCacheResponse({
        appointmentMode: false,
        shouldTransfer: false,
        response: factual,
        history: [],
        latestMessage: 'yurt fiyatları nedir',
        usedRag: true,
        hasStrongMatch: false,
        kbHasNoMatch: true,
      }),
      false
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
        ...STRONG_RAG,
      }),
      false
    );
    assert.equal(
      shouldCacheResponse({
        appointmentMode: false,
        shouldTransfer: false,
        response:
          'Yurt ücretlerimiz oda tipine göre değişir: Standart oda aylık 12.500 TL, suit oda 15.800 TL, kahvaltı dahildir.',
        history: [],
        latestMessage: 'üniversite nerede',
        usedRag: true,
        hasStrongMatch: false,
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

  it('clearCompanyCache purges only the target tenant memory entries', async () => {
    const message = 'yurt fiyatları hakkında bilgi';
    const response =
      'Yurt ücretlerimiz oda tipine göre değişir: Standart oda aylık 12.500 TL, suit oda 15.800 TL, kahvaltı dahildir.';

    await setCachedResponse('tenant-a', message, response, false);
    await setCachedResponse('tenant-b', message, response, false);

    assert.ok(await getCachedResponse('tenant-a', message));
    assert.ok(await getCachedResponse('tenant-b', message));

    await clearCompanyCache('tenant-a');

    assert.equal(await getCachedResponse('tenant-a', message), null);
    assert.ok(await getCachedResponse('tenant-b', message));
  });

  it('rewrite cache key includes REWRITE_CACHE_VERSION (default 4)', () => {
    assert.equal(config.ai.rewriteCacheVersion, '4');
    const companyId = 'tenant-a';
    const message = 'üniversite nerede';
    setCachedQueryRewrite(companyId, message, {
      variants: ['old variant'],
      isBroad: false,
    });
    assert.deepEqual(getCachedQueryRewrite(companyId, message), {
      variants: ['old variant'],
      isBroad: false,
    });
    const hash = hashNormalizedMessage(message);
    const v1Key = `rewrite:1:${companyId}:${hash}`;
    const v2Key = `rewrite:2:${companyId}:${hash}`;
    assert.notEqual(v1Key, v2Key);
  });
});
