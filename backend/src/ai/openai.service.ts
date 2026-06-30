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
import { getAppointmentContextForAI } from '../services/appointment.service';

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

function formatKnowledge(items: KnowledgeItem[]): string {
  if (!items.length) return '';
  const text = items.map((k) => `### ${k.title}\n${k.content}`).join('\n\n');
  return text.length > config.ai.maxKnowledgeChars
    ? `${text.slice(0, config.ai.maxKnowledgeChars)}\n...[kısaltıldı]`
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
  const knowledge = formatKnowledge((knowledgeResult.data || []) as KnowledgeItem[]);

  const systemPrompt = await buildAdminPanelPrompt(company, {
    knowledge,
    appointmentContext,
    lang: conversationLang,
  });

  const activePrompts = await getAllActivePromptContentsForAI();
  if (systemPrompt) {
    console.log(
      `[AI] Admin prompt: [${activePrompts.map((p) => p.prompt_key).join(', ')}] (${systemPrompt.length} karakter)`
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
  });

  const usage = completion.usage;
  const totalTokens = usage?.total_tokens || 0;

  await logAIUsage({
    companyId,
    customerPhone,
    promptTokens: usage?.prompt_tokens || 0,
    completionTokens: usage?.completion_tokens || 0,
    totalTokens,
    cached: false,
    skipped: false,
    model: config.openai.model,
  });

  return {
    message: completion.choices[0]?.message?.content?.trim() || '',
    shouldTransfer: false,
    skippedAI: false,
    tokensUsed: totalTokens,
  };
}
