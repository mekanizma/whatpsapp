/**
 * AI kota kontrolü — limit aşıldığında API çağrısı yapılmaz
 */

import { adminClient } from '../database/supabase';
import { config } from '../config';
import { normalizePhoneNumber } from '../whatsapp/message.handler';
import { getMonthStartISO } from '../utils/date';
import { AI_DISABLED_TICKET_SUBJECT } from './transfer.service';

export interface QuotaStatus {
  allowed: boolean;
  messagesUsed: number;
  messagesLimit: number;
  aiCallsUsed: number;
  aiCallsLimit: number;
}

export async function checkAIQuota(companyId: string): Promise<QuotaStatus> {
  if (config.demoMode) {
    return { allowed: true, messagesUsed: 0, messagesLimit: 9999, aiCallsUsed: 0, aiCallsLimit: 9999 };
  }

  const { data: sub } = await adminClient
    .from('subscriptions')
    .select('messages_used, messages_limit')
    .eq('company_id', companyId)
    .single();

  const messagesUsed = sub?.messages_used || 0;
  const messagesLimit = sub?.messages_limit || 1000;

  // AI çağrıları mesaj limitinin %80'i ile sınırlı (güvenlik marjı)
  const aiCallsLimit = Math.floor(messagesLimit * 0.8);

  const { count: aiCallsUsed } = await adminClient
    .from('ai_usage_logs')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('skipped', false)
    .eq('cached', false)
    .gte('created_at', getMonthStartISO());

  const aiUsed = aiCallsUsed || 0;
  const allowed = messagesUsed < messagesLimit && aiUsed < aiCallsLimit;

  return {
    allowed,
    messagesUsed,
    messagesLimit,
    aiCallsUsed: aiUsed,
    aiCallsLimit,
  };
}

export async function hasActiveTransferTicket(
  companyId: string,
  customerPhone: string,
  options?: { excludeAiDisabled?: boolean }
): Promise<boolean> {
  if (config.demoMode) return false;

  const phone = normalizePhoneNumber(customerPhone) || customerPhone.replace(/\D/g, '');

  let query = adminClient
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('customer_phone', phone)
    .in('status', ['open', 'in_progress']);

  if (options?.excludeAiDisabled) {
    query = query.neq('subject', AI_DISABLED_TICKET_SUBJECT);
  }

  const { count } = await query;

  return (count || 0) > 0;
}

export async function logAIUsage(params: {
  companyId: string;
  customerPhone: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  cached: boolean;
  skipped: boolean;
  skipReason?: string;
  model: string;
}): Promise<void> {
  if (config.demoMode) return;

  try {
    const { error } = await adminClient.from('ai_usage_logs').insert({
      company_id: params.companyId,
      customer_phone: params.customerPhone || null,
      prompt_tokens: params.promptTokens,
      completion_tokens: params.completionTokens,
      total_tokens: params.totalTokens,
      cached_tokens: params.cachedTokens ?? 0,
      cached: params.cached,
      skipped: params.skipped,
      skip_reason: params.skipReason || null,
      model: params.model,
    });

    if (error) {
      console.error('[AI Usage] Log kaydı başarısız:', error.message, error.code);
    }
  } catch (err) {
    console.error('[AI Usage] Log kaydı hatası:', err);
  }
}
