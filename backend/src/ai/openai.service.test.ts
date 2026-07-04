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
import { setCachedResponse, clearCompanyCache } from './ai-cache.service';
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
  appointmentContext: '',
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
    const message = 'çalışma saatleriniz nedir?';
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
