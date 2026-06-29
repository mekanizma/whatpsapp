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
import { filterRelevantKnowledge } from './knowledge-filter.service';
import {
  checkAIQuota,
  hasActiveTransferTicket,
  logAIUsage,
} from './ai-quota.service';

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
  customerPhone: string
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
  const [company, knowledgeResult, historyResult] = await Promise.all([
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
  ]);

  const knowledge = (knowledgeResult.data || []) as KnowledgeItem[];
  const history = (historyResult.data || [])
    .reverse()
    .filter((m) => m.message !== trimmed); // Mükerrer mesajı çıkar

  const knowledgeContext = filterRelevantKnowledge(knowledge, trimmed);
  const systemPrompt = buildCompactSystemPrompt(company, knowledgeContext);

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
  const finalMessage = sanitizeAIResponse(rawResponse, company);

  if (finalMessage) {
    setCachedResponse(companyId, trimmed, finalMessage, false);
  }

  return {
    message: finalMessage,
    shouldTransfer: false,
    skippedAI: false,
    tokensUsed: totalTokens,
  };
}

function sanitizeAIResponse(response: string, company: Company): string {
  const cleaned = response
    .replace(/transfer_to_human/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned) return cleaned;

  const contact = [company.phone, company.email].filter(Boolean).join(' / ');
  return contact
    ? `Bu konuda elimde kesin bilgi yok. Daha detaylı bilgi için bize ulaşabilirsiniz: ${contact}`
    : 'Bu konuda elimde kesin bilgi yok. Sorunuzu biraz daha detaylandırırsanız yardımcı olmaya çalışırım.';
}

/** Kısa sistem promptu — token tasarrufu */
function buildCompactSystemPrompt(company: Company, knowledge: string): string {
  return `Sen ${company.company_name} dijital asistanısın. Türkçe, kısa ve nazik cevap ver.
Kurallar:
- Verilen bilgilere dayanarak cevap ver; bilgi bankasında olmayan konularda da mantıklı ve yardımcı ol.
- Kesin bilgin yoksa bunu açıkça söyle, mümkünse alternatif öner veya iletişim bilgisi ver.
- Müşteri temsilcisine veya canlı desteğe yönlendirme yapma; her zaman kendin cevap ver.
- Fiyat, randevu gibi kesin bilgi gerektiren konularda uydurma; "Bu bilgi için ${company.phone || 'bizimle iletişime geçmenizi'} öneririm" de.
Tel: ${company.phone || '-'} | E-posta: ${company.email || '-'} | ${company.category}
Bilgi bankası:
${knowledge}`;
}
