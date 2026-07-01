/**
 * OpenAI Chat — yalnızca admin panel promptları
 */

import type OpenAI from 'openai';
import { config } from '../config';
import { createChatCompletion } from './openai-client';
import { adminClient } from '../database/supabase';
import { Company, KnowledgeItem } from '../types';
import { buildAdminPanelPrompt } from './admin-prompt-builder';
import { detectConversationLanguage } from './language.service';
import { logAIUsage } from './ai-quota.service';
import { getAllActivePromptContentsForAI } from '../services/prompt.service';
import { getAppointmentContextForAI, finalizeCustomerFacingMessage, APPOINTMENT_MARKER } from '../services/appointment.service';
import { preAIGate } from './ai-gate.service';
import { stripTransferMarker } from './transfer.service';
import { retrieveKnowledgeContext } from '../services/knowledge-retrieval.service';
import { isAppointmentIntent } from './knowledge-filter.service';
import { buildCollectedFieldsContext } from './appointment-collect.service';
import { handleAppointmentBooking } from './appointment-extract.service';

export interface AIResponse {
  message: string;
  shouldTransfer: boolean;
  skippedAI: boolean;
  skipReason?: string;
  tokensUsed: number;
  appointmentBooked?: boolean;
}

const companyCache = new Map<string, { data: Company; expires: number }>();

async function getCompany(companyId: string): Promise<Company> {
  const cached = companyCache.get(companyId);
  if (cached && Date.now() < cached.expires) return cached.data;

  const { data } = await adminClient
    .from('companies')
    .select('company_name, category, phone, email, address')
    .eq('id', companyId)
    .single();

  const company = data as Company;
  companyCache.set(companyId, { data: company, expires: Date.now() + 300_000 });
  return company;
}

function formatKnowledgeFallback(items: KnowledgeItem[]): string {
  if (!items.length) return '';
  const text = items.map((k) => `### ${k.title}\n${k.content}`).join('\n\n');
  return text.length > config.rag.maxContextChars
    ? `${text.slice(0, config.rag.maxContextChars)}\n...[kısaltıldı]`
    : text;
}

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
      .limit(config.ai.maxHistoryMessages),
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

  const conversationLang = detectConversationLanguage(trimmed, history);
  const allKnowledge = (knowledgeResult.data || []) as KnowledgeItem[];

  const retrieval = await retrieveKnowledgeContext(companyId, trimmed, allKnowledge);
  const knowledge = retrieval.context || formatKnowledgeFallback(allKnowledge);

  if (retrieval.usedRag) {
    console.log(
      `[RAG] ${retrieval.chunks.length} chunk retrieved (top score: ${retrieval.chunks[0]?.combined_score?.toFixed(3) ?? 'n/a'})`
    );
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

  const collectedContext = appointmentMode
    ? buildCollectedFieldsContext(history, trimmed, conversationLang)
    : '';

  const systemPrompt = await buildAdminPanelPrompt(company, {
    knowledge,
    appointmentContext,
    collectedContext,
    lang: conversationLang,
    appointmentMode,
  });

  const activePrompts = await getAllActivePromptContentsForAI();
  if (systemPrompt) {
    const usedKeys = activePrompts
      .filter((p) => {
        if (p.prompt_role === 'greeting' || p.prompt_role === 'translation') return false;
        if (p.prompt_role === 'appointment') return appointmentMode;
        return true;
      })
      .map((p) => p.prompt_key);
    console.log(
      `[AI] Admin prompt${appointmentMode ? ' [randevu]' : ''}: [${usedKeys.join(', ')}] (${systemPrompt.length} karakter)`
    );
  } else {
    console.warn('[AI] Aktif admin prompt yok — panelden prompt kaydedin');
  }

  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (systemPrompt) {
    chatMessages.push({ role: 'system', content: systemPrompt });
  }

  chatMessages.push(
    ...history.map((m) => ({
      role: (m.sender_type === 'customer' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.message.slice(0, 500),
    })),
    { role: 'user', content: trimmed.slice(0, 1000) }
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

  const raw = completion.choices[0]?.message?.content?.trim() || '';

  const booking = await handleAppointmentBooking(
    companyId,
    customerPhone,
    _customerName,
    raw,
    history,
    trimmed,
    conversationLang
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

  return {
    message,
    shouldTransfer,
    skippedAI: false,
    skipReason: shouldTransfer ? 'ai_transfer' : undefined,
    tokensUsed: totalTokens,
    appointmentBooked: !!booking.appointment,
  };
}
