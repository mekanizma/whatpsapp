/**
 * OpenAI Chat — yalnızca admin panel promptları
 */

import type OpenAI from 'openai';
import { config } from '../config';
import { createChatCompletion } from './openai-client';
import { adminClient } from '../database/supabase';
import { Company, KnowledgeItem } from '../types';
import {
  buildStaticSystemPrompt,
  buildDynamicUserMessage,
  buildLanguageBlockForTurn,
} from './admin-prompt-builder';
import { detectConversationLanguage } from './language.service';
import { logAIUsage } from './ai-quota.service';
import { getAllActivePromptContentsForAI } from '../services/prompt.service';
import { getAppointmentContextForAI, finalizeCustomerFacingMessage, APPOINTMENT_MARKER } from '../services/appointment.service';
import { preAIGate } from './ai-gate.service';
import { stripTransferMarker } from './transfer.service';
import { retrieveKnowledgeContext } from '../services/knowledge-retrieval.service';
import { isAppointmentIntent } from './knowledge-filter.service';
import { buildKnowledgeNoMatchHint } from './kb-answer.service';
import { prepareConversationHistoryForChat } from './conversation-history.service';
import { buildCollectedFieldsContext, parseCollectedFields } from './appointment-collect.service';
import { buildParsedSlotHint, reconcileAppointmentAiResponse } from './appointment-response.service';
import { handleAppointmentBooking } from './appointment-extract.service';
import { shouldRecordUnknownQuestion, isKnowledgeMissAiResponse } from './knowledge-miss.service';
import { buildAppointmentCompanyContext } from './appointment-company-context';
import {
  getCachedResponse,
  setCachedResponse,
  shouldCacheResponse,
} from './ai-cache.service';

export interface AIResponse {
  message: string;
  shouldTransfer: boolean;
  skippedAI: boolean;
  skipReason?: string;
  tokensUsed: number;
  appointmentBooked?: boolean;
  knowledgeMiss?: boolean;
}

const companyCache = new Map<string, { data: Company; expires: number }>();

async function getCompany(companyId: string): Promise<Company> {
  const cached = companyCache.get(companyId);
  if (cached && Date.now() < cached.expires) return cached.data;

  const { data } = await adminClient
    .from('companies')
    .select('id, company_name, category, phone, email, address, working_hours, timezone')
    .eq('id', companyId)
    .single();

  const company = data as Company;
  companyCache.set(companyId, { data: company, expires: Date.now() + 300_000 });
  return company;
}

const HISTORY_FETCH_EXTRA = 50;

export async function generateAIResponse(
  companyId: string,
  customerMessage: string,
  customerPhone: string,
  _customerName: string | null = null
): Promise<AIResponse> {
  const trimmed = customerMessage.trim();

  const [historyResult, company, knowledgeResult, appointmentContext] = await Promise.all([
    adminClient
      .from('messages')
      .select('sender_type, message')
      .eq('company_id', companyId)
      .eq('customer_phone', customerPhone)
      .order('created_at', { ascending: false })
      .limit(config.ai.maxHistoryMessages + HISTORY_FETCH_EXTRA),
    getCompany(companyId),
    adminClient
      .from('knowledge_base')
      .select('title, content, category')
      .eq('company_id', companyId)
      .eq('is_active', true),
    getAppointmentContextForAI(companyId).catch(() => ''),
  ]);

  const history = (historyResult.data || [])
    .reverse()
    .filter((m) => m.message !== trimmed);

  const chatHistory = prepareConversationHistoryForChat(history, trimmed);

  const conversationLang = detectConversationLanguage(trimmed, history);
  const appointmentCtx = buildAppointmentCompanyContext(company.working_hours, company.timezone);
  const allKnowledge = (knowledgeResult.data || []) as KnowledgeItem[];

  const retrieval = await retrieveKnowledgeContext(companyId, trimmed, allKnowledge);
  let knowledge = retrieval.context;
  if (!knowledge.trim() && retrieval.kbHasNoMatch && allKnowledge.length > 0) {
    knowledge = buildKnowledgeNoMatchHint(allKnowledge, conversationLang);
  }

  if (retrieval.usedRag) {
    console.log(
      `[RAG] ${retrieval.chunks.length} chunk retrieved (top score: ${retrieval.chunks[0]?.combined_score?.toFixed(3) ?? 'n/a'})`
    );
  } else if (retrieval.usedLexicalFallback) {
    console.warn('[RAG] Lexical fallback used — embedding retrieval unavailable');
  }

  const appointmentMode = isAppointmentIntent(trimmed, history);

  const gate = preAIGate(trimmed, history, conversationLang);
  if (gate.skipAI && gate.response) {
    await logAIUsage({
      companyId,
      customerPhone,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cached: false,
      skipped: true,
      skipReason: gate.reason,
      model: config.openai.model,
    });

    return {
      message: gate.response,
      shouldTransfer: gate.shouldTransfer ?? false,
      skippedAI: true,
      skipReason: gate.reason,
      tokensUsed: 0,
    };
  }

  if (!appointmentMode) {
    const cachedResponse = await getCachedResponse(companyId, trimmed);
    if (cachedResponse) {
      await logAIUsage({
        companyId,
        customerPhone,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cachedTokens: 0,
        cached: true,
        skipped: true,
        skipReason: 'response_cache',
        model: config.openai.model,
      });

      const knowledgeMiss = shouldRecordUnknownQuestion({
        customerMessage: trimmed,
        aiResponse: cachedResponse.message,
        shouldTransfer: cachedResponse.shouldTransfer,
        skippedAI: false,
        appointmentMode: false,
        kbHasNoMatch: isKnowledgeMissAiResponse(cachedResponse.message),
      });

      return {
        message: cachedResponse.message,
        shouldTransfer: cachedResponse.shouldTransfer,
        skippedAI: false,
        skipReason: undefined,
        tokensUsed: 0,
        knowledgeMiss,
      };
    }
  }

  const collectedContext = appointmentMode
    ? (() => {
        const collected = parseCollectedFields(history, trimmed);
        const slotHint = buildParsedSlotHint(history, trimmed, collected, appointmentCtx);
        return buildCollectedFieldsContext(history, trimmed, conversationLang) + slotHint;
      })()
    : '';

  const languageBlock = await buildLanguageBlockForTurn(conversationLang);

  const [staticSystemPrompt, activePrompts] = await Promise.all([
    buildStaticSystemPrompt(companyId, company),
    getAllActivePromptContentsForAI(),
  ]);

  const dynamicUserContent = buildDynamicUserMessage(trimmed.slice(0, 1000), {
    knowledge,
    knowledgeTitles: allKnowledge.map((k) => k.title),
    appointmentContext,
    collectedContext,
    lang: conversationLang,
    languageBlock,
  });

  if (staticSystemPrompt) {
    const usedKeys = activePrompts
      .filter((p) => p.prompt_role !== 'greeting' && p.prompt_role !== 'translation')
      .map((p) => p.prompt_key);
    console.log(
      `[AI] Static system prompt [${usedKeys.join(', ')}] (${staticSystemPrompt.length} karakter) + dynamic user (${dynamicUserContent.length} karakter)`
    );
  } else {
    console.warn('[AI] Aktif admin prompt yok — panelden prompt kaydedin');
  }

  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (staticSystemPrompt) {
    chatMessages.push({ role: 'system', content: staticSystemPrompt });
  }

  chatMessages.push(
    ...chatHistory.map((m) => ({
      role: (m.sender_type === 'customer' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.message,
    })),
    { role: 'user', content: dynamicUserContent }
  );

  const completion = await createChatCompletion(chatMessages, {
    maxTokens: config.ai.maxTokens,
    temperature: config.ai.temperature,
    usageLog: {
      companyId,
      customerPhone,
      skipped: false,
      cached: false,
    },
  });

  const usage = completion.usage;
  const totalTokens = usage?.total_tokens || 0;

  let raw = completion.choices[0]?.message?.content?.trim() || '';

  if (appointmentMode) {
    raw = reconcileAppointmentAiResponse(raw, history, trimmed, conversationLang, appointmentCtx);
  }

  const booking = await handleAppointmentBooking(
    companyId,
    customerPhone,
    _customerName,
    raw,
    history,
    trimmed,
    conversationLang,
    appointmentCtx
  );

  const { message, shouldTransfer } = stripTransferMarker(
    finalizeCustomerFacingMessage(booking.message, {
      hadAppointmentMarker: raw.includes(APPOINTMENT_MARKER),
      lang: conversationLang,
    })
  );

  if (booking.appointment) {
    console.log(
      `[Randevu] WhatsApp kaydı: ${booking.appointment.id} | ${booking.appointment.customer_name}`
    );
  }

  const knowledgeMiss = shouldRecordUnknownQuestion({
    customerMessage: trimmed,
    aiResponse: message,
    shouldTransfer,
    skippedAI: false,
    appointmentMode,
    kbHasNoMatch: retrieval.kbHasNoMatch,
  });

  if (knowledgeMiss) {
    console.log(`[KB Miss] Bilinmeyen soru kaydedilecek → ${trimmed.slice(0, 80)}`);
  }

  if (
    !booking.appointment &&
    shouldCacheResponse({
      appointmentMode,
      shouldTransfer,
      response: message,
      history,
      latestMessage: trimmed,
      kbHasNoMatch: retrieval.kbHasNoMatch,
      usedRag: retrieval.usedRag,
      hasStrongMatch: retrieval.usedRag && !retrieval.kbHasNoMatch,
    })
  ) {
    void setCachedResponse(companyId, trimmed, message, shouldTransfer);
  }

  return {
    message,
    shouldTransfer,
    skippedAI: false,
    skipReason: shouldTransfer ? 'ai_transfer' : undefined,
    tokensUsed: totalTokens,
    appointmentBooked: !!booking.appointment,
    knowledgeMiss,
  };
}
