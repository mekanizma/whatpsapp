/**
 * generateAIResponse — gate/cache must run before RAG (no rewrite, embeddings, or RPC on skip).
 */
process.env.DEMO_MODE = 'true';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateAIResponse,
  generateAIResponseDeps,
  COMPANY_AI_SELECT,
  type GenerateAIContext,
} from './openai.service';
import { knowledgeRetrievalDeps } from '../services/knowledge-retrieval.service';
import { buildRetrievalTexts } from '../services/knowledge-retrieval.service';
import {
  expandQueryForRetrieval,
  queryExpansionDeps,
} from '../services/query-expansion.service';
import { setCachedResponse, clearCompanyCache } from './ai-cache.service';
import { buildDynamicUserMessage } from './admin-prompt-builder';
import { buildKnowledgeNoMatchHint } from './kb-answer.service';
import type { Company } from '../types';

const COMPANY_ID = 'a0000000-0000-0000-0000-000000000099';
const PHONE = '905000000001';

const MOCK_COMPANY: Company = {
  id: COMPANY_ID,
  company_name: 'Test Co',
  category: 'education',
  phone: '5551234567',
  email: 'test@example.com',
  address: 'Test Address',
  working_hours: '{"monday":"09:00-18:00"}',
  timezone: 'Europe/Istanbul',
};

const MOCK_CONTEXT: GenerateAIContext = {
  history: [],
  company: MOCK_COMPANY,
  allKnowledge: [],
  ecommerceContext: '',
  ecommerceReturnsEnabled: false,
};

describe('generateAIResponse cost gates', () => {
  const origFetch = generateAIResponseDeps.fetchGenerateAIContext;
  const origRetrieve = generateAIResponseDeps.retrieveKnowledgeContext;
  const origChat = generateAIResponseDeps.createChatCompletion;
  const origEmbeddings = knowledgeRetrievalDeps.createEmbeddings;
  const origRpc = knowledgeRetrievalDeps.matchKnowledgeChunksRpc;

  const counters = {
    chatCompletions: 0,
    embeddings: 0,
    matchKnowledgeRpc: 0,
    retrieveKnowledge: 0,
  };

  beforeEach(() => {
    counters.chatCompletions = 0;
    counters.embeddings = 0;
    counters.matchKnowledgeRpc = 0;
    counters.retrieveKnowledge = 0;

    generateAIResponseDeps.fetchGenerateAIContext = async () => MOCK_CONTEXT;

    generateAIResponseDeps.retrieveKnowledgeContext = async (...args) => {
      counters.retrieveKnowledge++;
      return origRetrieve(...args);
    };

    generateAIResponseDeps.createChatCompletion = async (...args) => {
      counters.chatCompletions++;
      return origChat(...args);
    };

    knowledgeRetrievalDeps.createEmbeddings = async (...args) => {
      counters.embeddings++;
      return origEmbeddings(...args);
    };

    knowledgeRetrievalDeps.matchKnowledgeChunksRpc = (...args) => {
      counters.matchKnowledgeRpc++;
      return origRpc(...args);
    };
  });

  afterEach(() => {
    generateAIResponseDeps.fetchGenerateAIContext = origFetch;
    generateAIResponseDeps.retrieveKnowledgeContext = origRetrieve;
    generateAIResponseDeps.createChatCompletion = origChat;
    knowledgeRetrievalDeps.createEmbeddings = origEmbeddings;
    knowledgeRetrievalDeps.matchKnowledgeChunksRpc = origRpc;
  });

  it('greeting "merhaba" performs zero OpenAI, embedding, and match_knowledge_chunks calls', async () => {
    const result = await generateAIResponse(COMPANY_ID, 'merhaba', PHONE);

    assert.equal(result.skippedAI, true);
    assert.equal(result.skipReason, 'greeting_template');
    assert.equal(counters.retrieveKnowledge, 0);
    assert.equal(counters.chatCompletions, 0);
    assert.equal(counters.embeddings, 0);
    assert.equal(counters.matchKnowledgeRpc, 0);
  });

  it('response cache hit performs zero embedding, rewrite, and RPC calls', async () => {
    const message = 'hafta içi çalışma saatleriniz tam olarak nedir ve cumartesi açık mısınız?';
    const cached =
      'Pazartesi-Cuma 09:00-18:00 arası hizmet veriyoruz. Cumartesi 10:00-14:00. Pazar kapalıyız. Detaylı bilgi için web sitemizi ziyaret edebilirsiniz.';

    await setCachedResponse(COMPANY_ID, message, cached, false);

    const result = await generateAIResponse(COMPANY_ID, message, PHONE);

    assert.equal(result.message, cached);
    assert.equal(result.tokensUsed, 0);
    assert.equal(counters.retrieveKnowledge, 0);
    assert.equal(counters.chatCompletions, 0);
    assert.equal(counters.embeddings, 0);
    assert.equal(counters.matchKnowledgeRpc, 0);

    await clearCompanyCache(COMPANY_ID);
  });
});

describe('openai.service company fetch', () => {
  it('loads custom_instructions for prompt assembly', () => {
    assert.match(COMPANY_AI_SELECT, /custom_instructions/);
  });
});

describe('context-aware topic resolution (real cases)', () => {
  const origExpandChat = queryExpansionDeps.createChatCompletion;

  afterEach(() => {
    queryExpansionDeps.createChatCompletion = origExpandChat;
  });

  it('vaka A: follow-up about passport duration keeps pasaport in retrieval texts', async () => {
    queryExpansionDeps.createChatCompletion = async () =>
      ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                topic: 'pasaport süresi ve geçerliliği',
                previous_topic: 'pasaport başvurusu',
                topic_changed: false,
                depends_on_history: true,
                resolved_question: 'Pasaport 2 yıllık verildiyse öğrenci için geçerli midir?',
                variants: ['pasaport geçerlilik süresi', 'öğrenci pasaportu kaç yıllık olmalı'],
                is_broad: false,
              }),
            },
          },
        ],
        usage: { total_tokens: 20 },
      }) as never;

    const rewrite = await expandQueryForRetrieval(
      COMPANY_ID,
      '2 yıllığına verildi oluyor mu',
      [
        { sender_type: 'customer', message: 'Hocam pasaport başvurusunda bulundum' },
        { sender_type: 'ai', message: 'Pasaport için gerekli belgeler...' },
      ]
    );
    const texts = buildRetrievalTexts(rewrite.rawMessage, rewrite.variants, rewrite.intentVariant, {
      resolvedQuestion: rewrite.resolvedQuestion,
      topic: rewrite.topic,
    });
    assert.ok(texts.some((t) => /pasaport/i.test(t)));
  });

  it('vaka B: topic change drops pasaport and keeps yurt', async () => {
    queryExpansionDeps.createChatCompletion = async () =>
      ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                topic: 'yurt ücretleri',
                previous_topic: 'pasaport başvurusu',
                topic_changed: true,
                depends_on_history: false,
                resolved_question: 'Yurt ücretleri ne kadar?',
                variants: ['yurt ücreti', 'yurt fiyatları'],
                is_broad: false,
              }),
            },
          },
        ],
        usage: { total_tokens: 20 },
      }) as never;

    const rewrite = await expandQueryForRetrieval(
      COMPANY_ID,
      'peki yurt ücretleri ne kadar',
      [
        { sender_type: 'customer', message: 'Hocam pasaport başvurusunda bulundum' },
        { sender_type: 'ai', message: 'Pasaport için...' },
      ]
    );
    const texts = buildRetrievalTexts(rewrite.rawMessage, rewrite.variants, rewrite.intentVariant, {
      resolvedQuestion: rewrite.resolvedQuestion,
      topic: rewrite.topic,
    });
    const joined = texts.join(' ').toLocaleLowerCase('tr');
    assert.doesNotMatch(joined, /pasaport/);
    assert.match(joined, /yurt/);
  });
});

describe('generateAIResponse follow-up cache and empty rerank', () => {
  const origFetch = generateAIResponseDeps.fetchGenerateAIContext;
  const origRetrieve = generateAIResponseDeps.retrieveKnowledgeContext;
  const origChat = generateAIResponseDeps.createChatCompletion;

  afterEach(() => {
    generateAIResponseDeps.fetchGenerateAIContext = origFetch;
    generateAIResponseDeps.retrieveKnowledgeContext = origRetrieve;
    generateAIResponseDeps.createChatCompletion = origChat;
    void clearCompanyCache(COMPANY_ID);
  });

  it('short follow-up skips response cache even when an entry exists', async () => {
    const shortMsg = 'oluyor mu';
    await setCachedResponse(
      COMPANY_ID,
      shortMsg,
      'Bu önbellekten gelen yanlış yurt cevabıdır ve yeterince uzundur ki cache kabul edilsin.',
      false
    );

    let retrieveCalled = false;
    generateAIResponseDeps.fetchGenerateAIContext = async () => ({
      ...MOCK_CONTEXT,
      history: [
        { sender_type: 'customer', message: 'Hocam pasaport başvurusunda bulundum' },
        { sender_type: 'ai', message: 'Pasaport bilgisi...' },
      ],
      allKnowledge: [
        {
          id: 'kb1',
          company_id: COMPANY_ID,
          title: 'Pasaport',
          content: 'Pasaport 2 yıl',
          category: 'general',
          is_active: true,
        },
      ],
    });
    generateAIResponseDeps.retrieveKnowledgeContext = async () => {
      retrieveCalled = true;
      return {
        context: '### Pasaport\n2 yıllık verilir',
        chunks: [],
        usedRag: true,
        usedLexicalFallback: false,
        fallbackItems: [],
        kbHasNoMatch: false,
        topic: 'pasaport süresi',
        resolvedQuestion: 'Pasaport 2 yıllık oluyor mu',
        topicChanged: false,
        dependsOnHistory: true,
      };
    };
    generateAIResponseDeps.createChatCompletion = async () =>
      ({
        choices: [{ message: { content: 'Pasaport genellikle 2 yıllık verilir.' } }],
        usage: { total_tokens: 30 },
      }) as never;

    const result = await generateAIResponse(COMPANY_ID, shortMsg, PHONE);
    assert.equal(retrieveCalled, true);
    assert.match(result.message, /Pasaport/);
    assert.doesNotMatch(result.message, /önbellekten/);
  });

  it('when rerank drops all chunks, prompt has no KB citation and includes no-match hint', async () => {
    const knowledge = [
      {
        id: 'kb1',
        company_id: COMPANY_ID,
        title: 'Muhaceret',
        content: 'Muhaceret işlemleri...',
        category: 'general',
        is_active: true,
      },
    ];
    const noMatchHint = buildKnowledgeNoMatchHint(knowledge, 'tr');

    generateAIResponseDeps.fetchGenerateAIContext = async () => ({
      ...MOCK_CONTEXT,
      allKnowledge: knowledge,
    });
    generateAIResponseDeps.retrieveKnowledgeContext = async () => ({
      context: '',
      chunks: [],
      usedRag: true,
      usedLexicalFallback: false,
      fallbackItems: [],
      kbHasNoMatch: true,
      topic: 'yönlendirme',
      resolvedQuestion: 'yönlendirme',
      topicChanged: false,
      dependsOnHistory: false,
    });

    let userPrompt = '';
    generateAIResponseDeps.createChatCompletion = async (messages) => {
      const last = messages[messages.length - 1];
      userPrompt = typeof last.content === 'string' ? last.content : '';
      return {
        choices: [{ message: { content: 'Bu konuda bilgim yok, temsilciye aktarabilirim.' } }],
        usage: { total_tokens: 20 },
      } as never;
    };

    await generateAIResponse(COMPANY_ID, 'yönlendirme nedir tam olarak burada', PHONE);

    assert.match(userPrompt, /eşleşen içerik bulunamadı|eşleşme/i);
    assert.doesNotMatch(userPrompt, /Muhaceret işlemleri/);
    const expected = buildDynamicUserMessage('yönlendirme nedir tam olarak burada', {
      knowledge: noMatchHint,
      knowledgeTitles: ['Muhaceret'],
      lang: 'tr',
      resolvedTopic: 'yönlendirme',
      resolvedQuestion: 'yönlendirme',
    });
    assert.match(expected, /eşleşen içerik bulunamadı/);
  });
});
