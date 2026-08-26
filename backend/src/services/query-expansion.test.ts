import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseQueryRewriteResponse,
  detectUniversalIntentVariant,
  appendUniversalIntentVariant,
  stripIntentFromVariants,
  buildRewriteContextBlock,
  hashRewriteContextKey,
  expandQueryForRetrieval,
  queryExpansionDeps,
  type RetrievalHistoryMsg,
} from './query-expansion.service';
import { buildRetrievalTexts } from './knowledge-retrieval.service';
import {
  getCachedQueryRewrite,
  setCachedQueryRewrite,
  clearCompanyRewriteCache,
} from '../ai/ai-cache.service';

describe('query-expansion.service', () => {
  it('parses valid JSON rewrite response', () => {
    const parsed = parseQueryRewriteResponse(
      '{"variants":["fiyat bilgisi","ücretler","price list"],"is_broad":false,"topic":"ücretler","previous_topic":"","topic_changed":false,"depends_on_history":false,"resolved_question":"fiyat nedir"}'
    );
    assert.equal(parsed.variants.length, 3);
    assert.equal(parsed.isBroad, false);
    assert.equal(parsed.topic, 'ücretler');
    assert.equal(parsed.topicChanged, false);
    assert.equal(parsed.dependsOnHistory, false);
    assert.equal(parsed.resolvedQuestion, 'fiyat nedir');
    assert.match(parsed.variants.join(' '), /ücretler/);
  });

  it('parses long Turkish JSON variants without truncation loss', () => {
    const parsed = parseQueryRewriteResponse(
      '{"variants":["üniversite kampüs adresi","Final Üniversitesi nerede","university location Girne"],"is_broad":false,"topic":"adres","previous_topic":"","topic_changed":false,"depends_on_history":false,"resolved_question":"üniversite nerede"}'
    );
    assert.equal(parsed.variants.length, 3);
    assert.match(parsed.variants[1], /Final Üniversitesi nerede/);
  });

  it('flags broad queries from is_broad field', () => {
    const parsed = parseQueryRewriteResponse(
      '{"variants":["şirket hakkında","hizmetleriniz"],"is_broad":true,"topic":"","previous_topic":"","topic_changed":false,"depends_on_history":false,"resolved_question":"hakkınızda bilgi"}'
    );
    assert.equal(parsed.isBroad, true);
  });

  it('defaults safely on invalid JSON and missing fields', () => {
    const parsed = parseQueryRewriteResponse('not json at all', 'fallback soru');
    assert.deepEqual(parsed.variants, []);
    assert.equal(parsed.isBroad, false);
    assert.equal(parsed.topic, '');
    assert.equal(parsed.topicChanged, false);
    assert.equal(parsed.dependsOnHistory, false);
    assert.equal(parsed.resolvedQuestion, 'fallback soru');
  });

  it('extracts JSON from surrounding text', () => {
    const parsed = parseQueryRewriteResponse(
      'Here is the result:\n{"variants":["çalışma saatleri","working hours"],"is_broad":false,"topic":"saatler","previous_topic":"","topic_changed":false,"depends_on_history":false,"resolved_question":"çalışma saatleri"}\n'
    );
    assert.equal(parsed.variants.length, 2);
    assert.equal(parsed.isBroad, false);
    assert.equal(parsed.topic, 'saatler');
  });

  it('detectUniversalIntentVariant maps location queries to generic adres konum', () => {
    assert.equal(detectUniversalIntentVariant('üniversite nerede'), 'adres konum');
    assert.equal(detectUniversalIntentVariant('where is the university'), 'adres konum');
    assert.equal(detectUniversalIntentVariant('adres ne'), 'adres konum');
  });

  it('appendUniversalIntentVariant adds canonical phrase without duplicating', () => {
    const withIntent = appendUniversalIntentVariant(['üniversite adresi'], 'üniversite nerede');
    assert.ok(withIntent.includes('adres konum'));
    assert.equal(withIntent.length, 2);

    const already = appendUniversalIntentVariant(['adres konum'], 'üniversite nerede');
    assert.deepEqual(already, ['adres konum']);
  });

  it('stripIntentFromVariants removes canonical intent from LLM variants', () => {
    const stripped = stripIntentFromVariants(
      ['üniversite konumu', 'adres konum', 'kampüs adresi'],
      'adres konum'
    );
    assert.deepEqual(stripped, ['üniversite konumu', 'kampüs adresi']);
  });

  it('detectUniversalIntentVariant maps price, hours, and contact intents', () => {
    assert.equal(detectUniversalIntentVariant('fiyat ne kadar'), 'ücret fiyat');
    assert.equal(detectUniversalIntentVariant('what are your hours'), 'çalışma saatleri');
    assert.equal(detectUniversalIntentVariant('phone number please'), 'iletişim telefon');
  });

  it('buildRewriteContextBlock labels roles, keeps last N, skips system notes/summary', () => {
    const history: RetrievalHistoryMsg[] = [
      { sender_type: 'customer', message: 'eski 1' },
      { sender_type: 'ai', message: 'eski cevap' },
      { sender_type: 'customer', message: '[Önceki konuşma özeti — sistem] Ad: Ali' },
      { sender_type: 'ai', message: '[SISTEM NOTU: test]' },
      { sender_type: 'customer', message: 'Hocam pasaport başvurusunda bulundum' },
      { sender_type: 'ai', message: 'Pasaport için gerekli belgeler...' },
      { sender_type: 'customer', message: '2 yıllığına verildi oluyor mu' },
    ];

    const block = buildRewriteContextBlock(history, '2 yıllığına verildi oluyor mu', {
      maxMessages: 8,
    });

    assert.match(block, /Müşteri: Hocam pasaport/);
    assert.match(block, /Asistan: Pasaport için/);
    assert.doesNotMatch(block, /Önceki konuşma özeti/);
    assert.doesNotMatch(block, /SISTEM NOTU/);
    assert.doesNotMatch(block, /2 yıllığına verildi oluyor mu/);
  });

  it('buildRewriteContextBlock returns empty when maxMessages is 0', () => {
    const history: RetrievalHistoryMsg[] = [
      { sender_type: 'customer', message: 'pasaport' },
      { sender_type: 'ai', message: 'bilgi' },
    ];
    assert.equal(buildRewriteContextBlock(history, 'takip', { maxMessages: 0 }), '');
  });

  it('same message with different context yields different rewrite cache keys', () => {
    const companyId = 'co-ctx-cache';
    clearCompanyRewriteCache(companyId);
    const message = 'oluyor mu';
    const keyA = hashRewriteContextKey('Müşteri: pasaport başvurusu');
    const keyB = hashRewriteContextKey('Müşteri: yurt ücretleri');
    assert.notEqual(keyA, keyB);

    setCachedQueryRewrite(
      companyId,
      message,
      {
        variants: ['pasaport geçerlilik'],
        isBroad: false,
        topic: 'pasaport',
        resolvedQuestion: 'Pasaport oluyor mu',
      },
      keyA
    );
    setCachedQueryRewrite(
      companyId,
      message,
      {
        variants: ['yurt ücreti'],
        isBroad: false,
        topic: 'yurt',
        resolvedQuestion: 'Yurt oluyor mu',
      },
      keyB
    );

    const a = getCachedQueryRewrite(companyId, message, keyA);
    const b = getCachedQueryRewrite(companyId, message, keyB);
    assert.equal(a?.topic, 'pasaport');
    assert.equal(b?.topic, 'yurt');
    assert.notEqual(a?.resolvedQuestion, b?.resolvedQuestion);
    clearCompanyRewriteCache(companyId);
  });

  it('topic_changed true keeps previous-topic words out of buildRetrievalTexts', () => {
    const texts = buildRetrievalTexts(
      'peki yurt ücretleri ne kadar',
      ['yurt ücreti', 'yurt fiyatları'],
      'ücret fiyat',
      {
        resolvedQuestion: 'Yurt ücretleri ne kadar?',
        topic: 'yurt ücretleri',
      }
    );
    const joined = texts.join(' ').toLocaleLowerCase('tr');
    assert.match(joined, /yurt/);
    assert.doesNotMatch(joined, /pasaport/);
  });

  it('LLM error merges short follow-up with last customer message', async () => {
    const companyId = 'co-fallback-merge';
    clearCompanyRewriteCache(companyId);
    const orig = queryExpansionDeps.createChatCompletion;
    queryExpansionDeps.createChatCompletion = async () => {
      throw new Error('openai down');
    };

    try {
      const result = await expandQueryForRetrieval(
        companyId,
        '2 yıllığına verildi oluyor mu',
        [
          { sender_type: 'customer', message: 'Hocam pasaport başvurusunda bulundum' },
          { sender_type: 'ai', message: 'Pasaport bilgisi...' },
        ]
      );
      assert.equal(result.dependsOnHistory, true);
      assert.match(result.resolvedQuestion.toLocaleLowerCase('tr'), /pasaport/);
      assert.match(result.resolvedQuestion, /2 yıllığına verildi/);
    } finally {
      queryExpansionDeps.createChatCompletion = orig;
      clearCompanyRewriteCache(companyId);
    }
  });

  it('RAG_REWRITE_CONTEXT_MESSAGES=0 style: empty context block is legacy behavior', async () => {
    const companyId = 'co-no-context';
    clearCompanyRewriteCache(companyId);
    const orig = queryExpansionDeps.createChatCompletion;
    let userContent = '';

    queryExpansionDeps.createChatCompletion = async (messages) => {
      userContent = String(messages[1]?.content || '');
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                topic: 'yönlendirme',
                previous_topic: '',
                topic_changed: false,
                depends_on_history: false,
                resolved_question: 'yönlendirme',
                variants: ['yönlendirme işlemi'],
                is_broad: false,
              }),
            },
          },
        ],
        usage: { total_tokens: 10 },
      } as never;
    };

    try {
      // maxMessages=0 via empty history behaves like no context; also verify prompt has no Önceki konuşma
      await expandQueryForRetrieval(companyId, 'yönlendirme', []);
      assert.equal(userContent, 'yönlendirme');
      assert.doesNotMatch(userContent, /Önceki konuşma/);
    } finally {
      queryExpansionDeps.createChatCompletion = orig;
      clearCompanyRewriteCache(companyId);
    }
  });
});
