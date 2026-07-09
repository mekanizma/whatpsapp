/**
 * Şirket aboneliklerine paket atama — subscription_plans tablosundan güncel veriler
 */

import { adminClient } from '../database/supabase';

export type BillingPeriod = 'monthly' | 'yearly';

export interface ResolvedSubscriptionPlan {
  id: string;
  plan_type: string;
  name: string;
  description: string | null;
  features: string[];
  message_limit: number;
  user_limit: number;
  price_monthly: number;
  price_yearly: number | null;
  currency: string;
  is_active: boolean;
}

function normalizeFeatures(features: unknown): string[] {
  if (!Array.isArray(features)) return [];
  return features
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function mapPlanRow(row: Record<string, unknown>): ResolvedSubscriptionPlan {
  return {
    id: String(row.id),
    plan_type: String(row.plan_type),
    name: String(row.name),
    description: typeof row.description === 'string' ? row.description : null,
    features: normalizeFeatures(row.features),
    message_limit: Number(row.message_limit) || 0,
    user_limit: Number(row.user_limit) || 0,
    price_monthly: Number(row.price_monthly) || 0,
    price_yearly:
      row.price_yearly != null && row.price_yearly !== ''
        ? Number(row.price_yearly)
        : null,
    currency: typeof row.currency === 'string' ? row.currency.toUpperCase() : 'TRY',
    is_active: Boolean(row.is_active),
  };
}

const PLAN_SELECT =
  'id, plan_type, name, description, features, message_limit, user_limit, price_monthly, price_yearly, currency, is_active';

export function normalizeBillingPeriod(value: unknown): BillingPeriod {
  return value === 'yearly' ? 'yearly' : 'monthly';
}

export async function getSubscriptionPlanById(
  planId: string
): Promise<ResolvedSubscriptionPlan | null> {
  const { data, error } = await adminClient
    .from('subscription_plans')
    .select(PLAN_SELECT)
    .eq('id', planId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapPlanRow(data as Record<string, unknown>) : null;
}

export async function getSubscriptionPlanByType(
  planType: string
): Promise<ResolvedSubscriptionPlan | null> {
  const normalized = planType.trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await adminClient
    .from('subscription_plans')
    .select(PLAN_SELECT)
    .eq('plan_type', planType.trim())
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data) return mapPlanRow(data as Record<string, unknown>);

  const { data: ilikeData, error: ilikeError } = await adminClient
    .from('subscription_plans')
    .select(PLAN_SELECT)
    .ilike('plan_type', normalized)
    .limit(1)
    .maybeSingle();

  if (ilikeError) throw new Error(ilikeError.message);
  return ilikeData ? mapPlanRow(ilikeData as Record<string, unknown>) : null;
}

async function findSubscriptionPlanByLooseType(
  planType: string
): Promise<ResolvedSubscriptionPlan | null> {
  const needle = planType.trim().toLowerCase();
  if (!needle) return null;

  const { data, error } = await adminClient.from('subscription_plans').select(PLAN_SELECT);
  if (error) throw new Error(error.message);

  const found = (data || []).find((row) =>
    String(row.plan_type || '')
      .trim()
      .toLowerCase()
      .includes(needle)
  );

  return found ? mapPlanRow(found as Record<string, unknown>) : null;
}

export async function resolveSubscriptionPlan(input: {
  plan_id?: string | null;
  plan_type?: string | null;
  require_active?: boolean;
}): Promise<ResolvedSubscriptionPlan> {
  let plan: ResolvedSubscriptionPlan | null = null;

  if (input.plan_id?.trim()) {
    plan = await getSubscriptionPlanById(input.plan_id.trim());
  } else if (input.plan_type?.trim()) {
    plan = await getSubscriptionPlanByType(input.plan_type);
    if (!plan) {
      plan = await findSubscriptionPlanByLooseType(input.plan_type);
    }
  }

  if (!plan) {
    throw new Error('Geçersiz paket seçimi');
  }
  if (input.require_active !== false && !plan.is_active) {
    throw new Error('Seçilen paket aktif değil');
  }

  return plan;
}

export async function createCompanySubscription(input: {
  companyId: string;
  plan: ResolvedSubscriptionPlan;
  billingPeriod?: BillingPeriod;
  status?: string;
}): Promise<void> {
  const billingPeriod = normalizeBillingPeriod(input.billingPeriod);
  const yearlyPrice = input.plan.price_yearly;
  if (billingPeriod === 'yearly' && !(yearlyPrice && yearlyPrice > 0)) {
    throw new Error('Seçilen paket için yıllık fiyat tanımlı değil');
  }

  const { error } = await adminClient.from('subscriptions').insert({
    company_id: input.companyId,
    plan_id: input.plan.id,
    messages_limit: input.plan.message_limit,
    users_limit: input.plan.user_limit,
    billing_period: billingPeriod,
    status: input.status || 'trial',
  });

  if (error) throw new Error(error.message);
}

export async function applyPlanToCompany(input: {
  companyId: string;
  plan: ResolvedSubscriptionPlan;
  billingPeriod?: BillingPeriod;
  syncLimits?: boolean;
}): Promise<void> {
  const { data: existingSub, error: existingSubError } = await adminClient
    .from('subscriptions')
    .select('id, billing_period')
    .eq('company_id', input.companyId)
    .maybeSingle();

  if (existingSubError) throw new Error(existingSubError.message);

  if (!existingSub) {
    await createCompanySubscription({
      companyId: input.companyId,
      plan: input.plan,
      billingPeriod: input.billingPeriod,
    });
    const { error: companyError } = await adminClient
      .from('companies')
      .update({ subscription_plan: input.plan.plan_type })
      .eq('id', input.companyId);
    if (companyError) throw new Error(companyError.message);
    return;
  }

  const subUpdate: Record<string, unknown> = {
    plan_id: input.plan.id,
  };

  if (input.billingPeriod) {
    const billingPeriod = normalizeBillingPeriod(input.billingPeriod);
    const yearlyPrice = input.plan.price_yearly;
    if (billingPeriod === 'yearly' && !(yearlyPrice && yearlyPrice > 0)) {
      throw new Error('Seçilen paket için yıllık fiyat tanımlı değil');
    }
    subUpdate.billing_period = billingPeriod;
  }

  if (input.syncLimits !== false) {
    subUpdate.messages_limit = input.plan.message_limit;
    subUpdate.users_limit = input.plan.user_limit;
  }

  const { error: companyError } = await adminClient
    .from('companies')
    .update({ subscription_plan: input.plan.plan_type })
    .eq('id', input.companyId);

  if (companyError) throw new Error(companyError.message);

  const { error: subError, data: subData } = await adminClient
    .from('subscriptions')
    .update(subUpdate)
    .eq('company_id', input.companyId)
    .select('id')
    .maybeSingle();

  if (subError) throw new Error(subError.message);
  if (!subData) {
    throw new Error('Şirket aboneliği bulunamadı — önce abonelik kaydı oluşturulmalı');
  }
}
