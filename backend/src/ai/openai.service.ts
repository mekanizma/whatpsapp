/**
 * OpenAI AI Chat Engine — bilgi bankası zorunlu mod
 */

import OpenAI from 'openai';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { Company, KnowledgeItem } from '../types';
import { preAIGate } from './ai-gate.service';
import { filterRelevantKnowledge, isAppointmentIntent } from './knowledge-filter.service';
import { detectConversationEscalation } from './conversation-escalation.service';
import { formatKnowledgeOnlyAnswer } from './kb-answer.service';
import { buildAppointmentOnlyPrompt } from './appointment-prompt';
import { handleAppointmentBooking } from './appointment-extract.service';
import {
  checkAIQuota,
  hasActiveTransferTicket,
  logAIUsage,
} from './ai-quota.service';
import { TRANSFER_MARKER } from './system-prompt';
import { getAppointmentContextForAI, stripAppointmentMarkers, APPOINTMENT_MARKER } from '../services/appointment.service';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

const KB_MISS_MSG = 'Bu konuda bilgi bankamızda kayıt bulunmuyor.';

export interface AIResponse {
  message: string;
  shouldTransfer: boolean;
  skippedAI: boolean;
  skipReason?: string;
  tokensUsed: number;
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

export async function generateAIResponse(
  companyId: string,
  customerMessage: string,
  customerPhone: string,
  customerName: string | null = null
): Promise<AIResponse> {
  const trimmed = customerMessage.trim();

  if (await hasActiveTransferTicket(companyId, customerPhone)) {
    return {
      message: '',
      shouldTransfer: false,
      skippedAI: true,
      skipReason: 'active_ticket',
      tokensUsed: 0,
    };
  }

  const gate = preAIGate(trimmed);
  if (gate.skipAI && gate.response) {
    await logAIUsage({
      companyId, customerPhone,
      promptTokens: 0, completionTokens: 0, totalTokens: 0,
      cached: false, skipped: true, skipReason: gate.reason, model: config.openai.model,
    });
    return {
      message: gate.response,
      shouldTransfer: gate.shouldTransfer || false,
      skippedAI: true,
      skipReason: gate.reason,
      tokensUsed: 0,
    };
  }

  const quota = await checkAIQuota(companyId);
  if (!quota.allowed) {
    return {
      message: 'Mesaj limitinize ulaşıldı. Lütfen yöneticinizle iletişime geçin.',
      shouldTransfer: true,
      skippedAI: true,
      skipReason: 'quota_exceeded',
      tokensUsed: 0,
    };
  }

  const [knowledgeResult, historyResult, appointmentContext] = await Promise.all([
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
    getAppointmentContextForAI(companyId).catch(() => 'Takvim bilgisi yok.'),
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
    await logAIUsage({
      companyId, customerPhone,
      promptTokens: 0, completionTokens: 0, totalTokens: 0,
      cached: false, skipped: true, model: config.openai.model,
    });
    return {
      message: KB_MISS_MSG,
      shouldTransfer: false,
      skippedAI: true,
      skipReason: kbFilter.kbEmpty ? 'kb_empty' : 'kb_no_match',
      tokensUsed: 0,
    };
  }

  // ─── BİLGİ SORUSU: OpenAI YOK — doğrudan bilgi bankası metni ───
  if (kbFilter.hasRelevantContent && !appointmentFlow) {
    const answer = formatKnowledgeOnlyAnswer(kbFilter.items);
    await logAIUsage({
      companyId, customerPhone,
      promptTokens: 0, completionTokens: 0, totalTokens: 0,
      cached: false, skipped: true, skipReason: 'kb_direct', model: config.openai.model,
    });
    return {
      message: answer || KB_MISS_MSG,
      shouldTransfer: false,
      skippedAI: true,
      skipReason: 'kb_direct',
      tokensUsed: 0,
    };
  }

  // ─── RANDEVU: sınırlı OpenAI (yalnızca randevu toplama) ───
  const systemPrompt = buildAppointmentOnlyPrompt(kbFilter.context, appointmentContext);

  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({
      role: (m.sender_type === 'customer' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.message.slice(0, 300),
    })),
    { role: 'user', content: trimmed.slice(0, 500) },
  ];

  const completion = await openai.chat.completions.create({
    model: config.openai.model,
    messages: chatMessages,
    temperature: 0,
    max_tokens: config.ai.maxTokens,
  });

  const usage = completion.usage;
  const totalTokens = usage?.total_tokens || 0;

  await logAIUsage({
    companyId, customerPhone,
    promptTokens: usage?.prompt_tokens || 0,
    completionTokens: usage?.completion_tokens || 0,
    totalTokens,
    cached: false, skipped: false, model: config.openai.model,
  });

  const rawResponse = completion.choices[0]?.message?.content?.trim() || '';
  const { message: afterBooking, appointment } = await handleAppointmentBooking(
    companyId,
    customerPhone,
    customerName,
    rawResponse,
    history,
    trimmed
  );
  const { message: finalMessage, shouldTransfer } = sanitizeAIResponse(afterBooking);

  if (appointment) {
    console.log(`[AI] Randevu oluşturuldu: ${appointment.id} → ${appointment.customer_phone}`);
  } else if (rawResponse.includes(APPOINTMENT_MARKER)) {
    console.warn('[AI] APPOINTMENT marker var ama kayıt oluşmadı — structured fallback denendi');
  }

  return {
    message: finalMessage,
    shouldTransfer,
    skippedAI: false,
    tokensUsed: totalTokens,
  };
}

function sanitizeAIResponse(
  response: string
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
      ? 'Sizi canlı destek temsilcimize bağlıyorum.'
      : KB_MISS_MSG,
    shouldTransfer: true,
  };
}
