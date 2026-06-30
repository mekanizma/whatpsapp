/**
 * OpenAI AI Chat Engine — kredi optimize edilmiş
 * - Ön filtre (şablon cevaplar)
 * - Yanıt önbelleği
 * - Filtrelenmiş bilgi bankası
 * - Kısa geçmiş (max 4 mesaj)
 * - Token sınırları ve kullanım loglama
 */

import OpenAI from 'openai';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { Company, KnowledgeItem } from '../types';
import { preAIGate } from './ai-gate.service';
import { getCachedResponse, setCachedResponse } from './ai-cache.service';
import { filterRelevantKnowledge, isAppointmentIntent } from './knowledge-filter.service';
import { detectConversationEscalation } from './conversation-escalation.service';
import {
  checkAIQuota,
  hasActiveTransferTicket,
  logAIUsage,
} from './ai-quota.service';
import { buildSystemPrompt, TRANSFER_MARKER } from './system-prompt';
import { getAppointmentContextForAI, processAIAppointmentBooking, stripAppointmentMarkers, APPOINTMENT_MARKER } from '../services/appointment.service';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export interface AIResponse {
  message: string;
  shouldTransfer: boolean;
  skippedAI: boolean;
  skipReason?: string;
  tokensUsed: number;
}

// Şirket profili önbelleği (5 dk) — her mesajda DB sorgusu önlenir
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

export async function generateAIResponse(
  companyId: string,
  customerMessage: string,
  customerPhone: string,
  customerName: string | null = null
): Promise<AIResponse> {
  const trimmed = customerMessage.trim();

  // Aktif canlı destek talebi varsa AI yanıt vermesin — temsilci devralsın
  if (await hasActiveTransferTicket(companyId, customerPhone)) {
    return {
      message: '',
      shouldTransfer: false,
      skippedAI: true,
      skipReason: 'active_ticket',
      tokensUsed: 0,
    };
  }

  // 1) Ön filtre — API çağrısı yok
  const gate = preAIGate(trimmed);
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
      shouldTransfer: gate.shouldTransfer || false,
      skippedAI: true,
      skipReason: gate.reason,
      tokensUsed: 0,
    };
  }

  // 2) Kota kontrolü
  const quota = await checkAIQuota(companyId);
  if (!quota.allowed) {
    const msg = 'Mesaj limitinize ulaşıldı. Lütfen yöneticinizle iletişime geçin.';
    return { message: msg, shouldTransfer: true, skippedAI: true, skipReason: 'quota_exceeded', tokensUsed: 0 };
  }

  // 3) Önbellek kontrolü
  const cached = getCachedResponse(companyId, trimmed);
  if (cached) {
    await logAIUsage({
      companyId, customerPhone,
      promptTokens: 0, completionTokens: 0, totalTokens: 0,
      cached: true, skipped: false, model: config.openai.model,
    });
    return { ...cached, shouldTransfer: false, skippedAI: false, tokensUsed: 0 };
  }

  // 4) OpenAI çağrısı — optimize edilmiş context
  const [company, knowledgeResult, historyResult, appointmentContext] = await Promise.all([
    getCompany(companyId),
    adminClient
      .from('knowledge_base')
      .select('title, content, category')
      .eq('company_id', companyId)
      .eq('is_active', true),
    adminClient
      .from('messages')
      .select('sender_type, message')
      .eq('company_id', companyId)
      .eq('customer_phone', customerPhone)
      .order('created_at', { ascending: false })
      .limit(config.ai.maxHistoryMessages),
    getAppointmentContextForAI(companyId).catch(() => 'Takvim bilgisi şu an alınamadı.'),
  ]);

  const knowledge = (knowledgeResult.data || []) as KnowledgeItem[];
  const history = (historyResult.data || [])
    .reverse()
    .filter((m) => m.message !== trimmed);

  const kbFilter = filterRelevantKnowledge(knowledge, trimmed);
  const appointmentFlow = isAppointmentIntent(trimmed, history);
  const kbWillFail = !kbFilter.hasRelevantContent && !appointmentFlow;

  const escalation = detectConversationEscalation(trimmed, history, kbWillFail);
  if (escalation.escalate && escalation.response) {
    await logAIUsage({
      companyId, customerPhone,
      promptTokens: 0, completionTokens: 0, totalTokens: 0,
      cached: false, skipped: true, model: config.openai.model,
    });
    return {
      message: escalation.response,
      shouldTransfer: true,
      skippedAI: true,
      skipReason: escalation.reason,
      tokensUsed: 0,
    };
  }

  if (kbWillFail) {
    const msg = kbFilter.kbEmpty
      ? 'Bilgi bankamızda bu konuyla ilgili kayıt bulunmuyor.'
      : 'Bu konuda bilgi bankamızda kayıt bulunmuyor.';
    await logAIUsage({
      companyId, customerPhone,
      promptTokens: 0, completionTokens: 0, totalTokens: 0,
      cached: false, skipped: true, model: config.openai.model,
    });
    return {
      message: msg,
      shouldTransfer: false,
      skippedAI: true,
      skipReason: kbFilter.kbEmpty ? 'kb_empty' : 'kb_no_match',
      tokensUsed: 0,
    };
  }

  const knowledgeContext = kbFilter.context;
  const systemPrompt = buildSystemPrompt(company, knowledgeContext, appointmentContext);

  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({
      role: (m.sender_type === 'customer' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.message.slice(0, 300), // Uzun mesajları kırp
    })),
    { role: 'user', content: trimmed.slice(0, 500) },
  ];

  const completion = await openai.chat.completions.create({
    model: config.openai.model,
    messages: chatMessages,
    temperature: config.ai.temperature,
    max_tokens: config.ai.maxTokens,
    presence_penalty: 0.1,
    frequency_penalty: 0.1,
  });

  const usage = completion.usage;
  const promptTokens = usage?.prompt_tokens || 0;
  const completionTokens = usage?.completion_tokens || 0;
  const totalTokens = usage?.total_tokens || 0;

  await logAIUsage({
    companyId, customerPhone,
    promptTokens, completionTokens, totalTokens,
    cached: false, skipped: false, model: config.openai.model,
  });

  const rawResponse = completion.choices[0]?.message?.content?.trim() || '';
  const { message: afterBooking, appointment } = await processAIAppointmentBooking(
    companyId,
    customerPhone,
    customerName,
    rawResponse
  );
  const { message: finalMessage, shouldTransfer } = sanitizeAIResponse(afterBooking, company);

  if (appointment) {
    console.log(`[AI] Randevu oluşturuldu: ${appointment.id} → ${appointment.customer_phone}`);
  } else if (rawResponse.includes(APPOINTMENT_MARKER)) {
    console.warn('[AI] APPOINTMENT marker bulundu ama kayıt oluşmadı');
  }

  if (finalMessage && !shouldTransfer) {
    setCachedResponse(companyId, trimmed, finalMessage, false);
  }

  return {
    message: finalMessage,
    shouldTransfer,
    skippedAI: false,
    tokensUsed: totalTokens,
  };
}

function sanitizeAIResponse(
  response: string,
  company: Company
): { message: string; shouldTransfer: boolean } {
  const shouldTransfer = response.includes(TRANSFER_MARKER);
  const cleaned = stripAppointmentMarkers(
    response
      .replace(new RegExp(TRANSFER_MARKER.replace(/[[\]]/g, '\\$&'), 'g'), '')
      .replace(/transfer_to_human/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
  );

  if (cleaned) return { message: cleaned, shouldTransfer };

  return {
    message: shouldTransfer
      ? 'Sizi canlı destek temsilcimize bağlıyorum. Kısa süre içinde size dönüş yapılacaktır.'
      : 'Bu konuda bilgi bankamızda kayıt bulunmuyor. Sizi canlı destek temsilcimize aktarıyorum.',
    shouldTransfer: true,
  };
}
