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
import { preAIGate } from './ai-gate.service';
import { stripTransferMarker } from './transfer.service';
import { retrieveKnowledgeContext } from '../services/knowledge-retrieval.service';
import { isAppointmentIntent } from './knowledge-filter.service';
import { buildKnowledgeNoMatchHint } from './kb-answer.service';
import { prepareConversationHistoryForChat } from './conversation-history.service';
import { runAppointmentWorkflow } from './appointment-workflow.service';
import { shouldRecordUnknownQuestion, isKnowledgeMissAiResponse } from './knowledge-miss.service';
import { buildAppointmentCompanyContext } from './appointment-company-context';
import {
  getCachedResponse,
  setCachedResponse,
  shouldCacheResponse,
} from './ai-cache.service';
import {
  getEcommerceContextForAI,
  getEcommerceSettings,
  lookupOrderStatusForAI,
  lookupShipmentForAI,
  companyCanUseEcommerce,
} from '../services/ecommerce.service';
import {
  buildWebsiteCatalogContext,
  isProductCatalogIntent,
  isWebsiteApiConfigured,
} from '../services/website-api.client';

const HISTORY_FETCH_EXTRA = 50;

/** Test / override hooks (see webhookDeps pattern) */
export interface GenerateAIContext {
  history: { sender_type: string; message: string }[];
  company: Company;
  allKnowledge: KnowledgeItem[];
  ecommerceContext: string;
  ecommerceReturnsEnabled: boolean;
}

const ORDER_NUMBER_RE = /(?:sipari[sş]\s*(?:no|numara(?:s[ıi])?|#)?|order\s*(?:no|#|number)?)\s*[:#]?\s*([A-Za-z0-9-]{4,})\b/i;
const TRACKING_NUMBER_RE =
  /(?:kargo|takip|tracking)\s*(?:no|numara(?:s[ıi])?|#)?\s*[:#]?\s*([A-Za-z0-9-]{6,})\b/i;

async function buildEcommerceLookupContext(
  companyId: string,
  message: string,
  customerPhone: string
): Promise<string> {
  const parts: string[] = [];
  const orderMatch = message.match(ORDER_NUMBER_RE);
  if (orderMatch?.[1]) {
    const orderInfo = await lookupOrderStatusForAI(companyId, orderMatch[1], customerPhone).catch(
      () => null
    );
    if (orderInfo) parts.push(`Bulunan sipariş:\n${orderInfo}`);
  }

  const trackingMatch = message.match(TRACKING_NUMBER_RE);
  if (trackingMatch?.[1]) {
    const shipInfo = await lookupShipmentForAI(companyId, trackingMatch[1]).catch(() => null);
    if (shipInfo) parts.push(`Bulunan kargo:\n${shipInfo}`);
  }

  return parts.join('\n\n');
}

async function fetchGenerateAIContext(
  companyId: string,
  customerPhone: string,
  trimmed: string
): Promise<GenerateAIContext> {
  const [historyResult, company, knowledgeResult, ecommerceBase] = await Promise.all([
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
        .eq('is_active', true)
        .limit(200),
      (async () => {
        const allowed = await companyCanUseEcommerce(companyId).catch(() => false);
        if (!allowed) return { context: '', returnsEnabled: false };
        const [base, settings, lookup] = await Promise.all([
          getEcommerceContextForAI(companyId).catch(() => ''),
          getEcommerceSettings(companyId).catch(() => null),
          buildEcommerceLookupContext(companyId, trimmed, customerPhone).catch(() => ''),
        ]);

        let catalog = '';
        if (settings && isWebsiteApiConfigured(settings) && isProductCatalogIntent(trimmed)) {
          catalog = await buildWebsiteCatalogContext(settings, trimmed).catch(() => '');
        }

        const context = [base, lookup, catalog].filter(Boolean).join('\n\n');
        return {
          context,
          returnsEnabled: Boolean(settings?.returns_enabled),
        };
      })(),
    ]);

  const history = (historyResult.data || [])
    .reverse()
    .filter((m) => m.message !== trimmed);

  return {
    history,
    company,
    allKnowledge: (knowledgeResult.data || []) as KnowledgeItem[],
    ecommerceContext: ecommerceBase.context,
    ecommerceReturnsEnabled: ecommerceBase.returnsEnabled,
  };
}

export const generateAIResponseDeps = {
  fetchGenerateAIContext,
  retrieveKnowledgeContext,
  createChatCompletion,
};

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

export const COMPANY_AI_SELECT =
  'id, company_name, category, phone, email, address, working_hours, timezone, custom_instructions';

export function invalidateCompanyCache(companyId?: string): void {
  if (!companyId) {
    companyCache.clear();
    return;
  }
  companyCache.delete(companyId);
}

async function getCompany(companyId: string): Promise<Company> {
  const cached = companyCache.get(companyId);
  if (cached && Date.now() < cached.expires) return cached.data;

  const { data } = await adminClient
    .from('companies')
    .select(COMPANY_AI_SELECT)
    .eq('id', companyId)
    .single();

  const company = data as Company;
  companyCache.set(companyId, { data: company, expires: Date.now() + 300_000 });
  return company;
}

export async function generateAIResponse(
  companyId: string,
  customerMessage: string,
  customerPhone: string,
  _customerName: string | null = null
): Promise<AIResponse> {
  const trimmed = customerMessage.trim();

  const { history, company, allKnowledge, ecommerceContext, ecommerceReturnsEnabled } =
    await generateAIResponseDeps.fetchGenerateAIContext(companyId, customerPhone, trimmed);

  const chatHistory = prepareConversationHistoryForChat(history, trimmed);

  const conversationLang = detectConversationLanguage(trimmed, history);
  const appointmentCtx = buildAppointmentCompanyContext(company.working_hours, company.timezone);

  const gate = preAIGate(trimmed, history, conversationLang, {
    ecommerceReturnsEnabled,
  });
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

  const appointmentMode = isAppointmentIntent(trimmed, history);

  if (appointmentMode) {
    const workflow = await runAppointmentWorkflow(
      companyId,
      customerPhone,
      history,
      trimmed,
      appointmentCtx
    );

    await logAIUsage({
      companyId,
      customerPhone,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cached: false,
      skipped: true,
      skipReason: 'appointment_workflow',
      model: config.openai.model,
    });

    if (workflow.appointment) {
      console.log(
        `[Randevu] WhatsApp kaydı: ${workflow.appointment.id} | ${workflow.appointment.customer_name}`
      );
    }

    return {
      message: workflow.message,
      shouldTransfer: false,
      skippedAI: true,
      skipReason: 'appointment_workflow',
      tokensUsed: 0,
      appointmentBooked: !!workflow.appointment,
      knowledgeMiss: false,
    };
  }

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

  const retrieval = await generateAIResponseDeps.retrieveKnowledgeContext(
    companyId,
    trimmed,
    allKnowledge
  );
  let knowledge = retrieval.context;
  if (retrieval.kbHasNoMatch && allKnowledge.length > 0) {
    knowledge = buildKnowledgeNoMatchHint(allKnowledge, conversationLang);
  }

  if (retrieval.usedRag) {
    console.log(
      `[RAG] ${retrieval.chunks.length} chunk retrieved (top score: ${retrieval.chunks[0]?.combined_score?.toFixed(3) ?? 'n/a'})`
    );
  } else if (retrieval.usedLexicalFallback) {
    console.warn('[RAG] Lexical fallback used — embedding retrieval unavailable');
  }

  const languageBlock = await buildLanguageBlockForTurn(conversationLang);

  const [staticSystemPrompt, activePrompts] = await Promise.all([
    buildStaticSystemPrompt(companyId, company),
    getAllActivePromptContentsForAI(),
  ]);

  const dynamicUserContent = buildDynamicUserMessage(trimmed.slice(0, 1000), {
    knowledge,
    knowledgeTitles: allKnowledge.map((k) => k.title),
    ecommerceContext,
    lang: conversationLang,
    languageBlock,
  });

  if (staticSystemPrompt) {
    const usedKeys = activePrompts
      .filter(
        (p) =>
          p.prompt_role !== 'greeting' &&
          p.prompt_role !== 'translation' &&
          p.prompt_role !== 'appointment'
      )
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

  const completion = await generateAIResponseDeps.createChatCompletion(chatMessages, {
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

  const raw = completion.choices[0]?.message?.content?.trim() || '';

  const { message, shouldTransfer } = stripTransferMarker(raw);

  const knowledgeMiss = shouldRecordUnknownQuestion({
    customerMessage: trimmed,
    aiResponse: message,
    shouldTransfer,
    skippedAI: false,
    appointmentMode: false,
    kbHasNoMatch: retrieval.kbHasNoMatch,
  });

  if (knowledgeMiss) {
    console.log(`[KB Miss] Bilinmeyen soru kaydedilecek → ${trimmed.slice(0, 80)}`);
  }

  if (
    shouldCacheResponse({
      appointmentMode: false,
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
    appointmentBooked: false,
    knowledgeMiss,
  };
}
