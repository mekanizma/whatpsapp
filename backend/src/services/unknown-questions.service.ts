/**
 * Bilinmeyen sorular — bilgi bankasında olmayan müşteri soruları
 */

import { adminClient } from '../database/supabase';
import { planHasModule } from './plan-capabilities.service';
import { normalizeQuestionText } from '../ai/knowledge-miss.service';

export type UnknownQuestionStatus = 'open' | 'resolved' | 'dismissed' | 'added_to_kb';

export interface UnknownQuestionRow {
  id: string;
  company_id: string;
  customer_phone: string;
  customer_name: string | null;
  question: string;
  ai_response: string | null;
  status: UnknownQuestionStatus;
  occurrence_count: number;
  last_asked_at: string;
  created_at: string;
  updated_at: string;
}

async function getCompanyPlanType(companyId: string): Promise<string> {
  const { data: sub } = await adminClient
    .from('subscriptions')
    .select('plan:plan_id(plan_type)')
    .eq('company_id', companyId)
    .maybeSingle();

  const planRow = sub?.plan;
  const plan = Array.isArray(planRow) ? planRow[0] : planRow;
  if (plan && typeof plan === 'object' && 'plan_type' in plan) {
    return String((plan as { plan_type: string }).plan_type);
  }

  const { data: company } = await adminClient
    .from('companies')
    .select('subscription_plan')
    .eq('id', companyId)
    .single();

  return String(company?.subscription_plan || 'starter');
}

export async function companyCanUseUnknownQuestions(companyId: string): Promise<boolean> {
  const planType = await getCompanyPlanType(companyId);
  return planHasModule(planType, 'unknown_questions');
}

export async function recordUnknownQuestion(params: {
  companyId: string;
  customerPhone: string;
  customerName: string | null;
  question: string;
  aiResponse: string;
}): Promise<void> {
  const allowed = await companyCanUseUnknownQuestions(params.companyId);
  if (!allowed) return;

  const normalized = normalizeQuestionText(params.question);
  if (!normalized || normalized.length < 3) return;

  const { data: existing } = await adminClient
    .from('unknown_questions')
    .select('id, occurrence_count')
    .eq('company_id', params.companyId)
    .eq('customer_phone', params.customerPhone)
    .eq('status', 'open')
    .ilike('question', params.question.trim())
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    await adminClient
      .from('unknown_questions')
      .update({
        occurrence_count: existing.occurrence_count + 1,
        ai_response: params.aiResponse.slice(0, 2000),
        customer_name: params.customerName,
        last_asked_at: now,
        updated_at: now,
      })
      .eq('id', existing.id);
    return;
  }

  const { data: similar } = await adminClient
    .from('unknown_questions')
    .select('id, occurrence_count, question')
    .eq('company_id', params.companyId)
    .eq('customer_phone', params.customerPhone)
    .eq('status', 'open')
    .order('last_asked_at', { ascending: false })
    .limit(20);

  const match = (similar || []).find(
    (row) => normalizeQuestionText(row.question) === normalized
  );

  if (match) {
    await adminClient
      .from('unknown_questions')
      .update({
        occurrence_count: match.occurrence_count + 1,
        ai_response: params.aiResponse.slice(0, 2000),
        customer_name: params.customerName,
        last_asked_at: now,
        updated_at: now,
      })
      .eq('id', match.id);
    return;
  }

  await adminClient.from('unknown_questions').insert({
    company_id: params.companyId,
    customer_phone: params.customerPhone,
    customer_name: params.customerName,
    question: params.question.trim().slice(0, 1000),
    ai_response: params.aiResponse.slice(0, 2000),
    status: 'open',
    occurrence_count: 1,
    last_asked_at: now,
    updated_at: now,
  }).then(({ error }) => {
    if (error) {
      console.error('[UnknownQuestions] Kayıt hatası:', error.message);
    } else {
      console.log(`[UnknownQuestions] Kaydedildi: ${params.question.slice(0, 60)}`);
    }
  });
}

export async function listUnknownQuestions(
  companyId: string,
  status?: UnknownQuestionStatus
): Promise<UnknownQuestionRow[]> {
  let query = adminClient
    .from('unknown_questions')
    .select('*')
    .eq('company_id', companyId)
    .order('last_asked_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as UnknownQuestionRow[];
}

export async function updateUnknownQuestion(
  companyId: string,
  id: string,
  updates: { status?: UnknownQuestionStatus }
): Promise<UnknownQuestionRow> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.status) payload.status = updates.status;

  const { data, error } = await adminClient
    .from('unknown_questions')
    .update(payload)
    .eq('id', id)
    .eq('company_id', companyId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as UnknownQuestionRow;
}
