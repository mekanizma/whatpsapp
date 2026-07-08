/**
 * Subscription plan management (super admin)
 */

import { adminClient } from '../database/supabase';
import {
  planNeedsEnglishTranslation,
  translatePlanContentToEnglish,
} from './plan-translation.service';

export interface SubscriptionPlanRow {
  id: string;
  plan_type: string;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
  features: string[];
  features_en: string[];
  message_limit: number;
  user_limit: number;
  price_monthly: number;
  price_yearly: number | null;
  currency: string;
  is_active: boolean;
  created_at: string;
}

const ALLOWED_CURRENCIES = new Set(['TRY', 'USD', 'EUR', 'GBP']);

export interface UpdateSubscriptionPlanInput {
  name?: string;
  description?: string | null;
  features?: string[];
  message_limit?: number;
  user_limit?: number;
  price_monthly?: number;
  price_yearly?: number | null;
  currency?: string;
  is_active?: boolean;
  sync_subscriptions?: boolean;
}

export interface CreateSubscriptionPlanInput {
  plan_type: string;
  name: string;
  description?: string | null;
  features?: string[];
  message_limit: number;
  user_limit: number;
  price_monthly: number;
  price_yearly?: number | null;
  currency?: string;
  is_active?: boolean;
}

const PLAN_TYPE_PATTERN = /^[a-z][a-z0-9_]{1,48}$/;

function normalizePlanType(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function normalizeFeatures(features: unknown): string[] {
  if (!Array.isArray(features)) return [];
  return features
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function mapPlanRow(row: Record<string, unknown>): SubscriptionPlanRow {
  return {
    id: String(row.id),
    plan_type: String(row.plan_type),
    name: String(row.name),
    name_en: typeof row.name_en === 'string' ? row.name_en : null,
    description: typeof row.description === 'string' ? row.description : null,
    description_en: typeof row.description_en === 'string' ? row.description_en : null,
    features: normalizeFeatures(row.features),
    features_en: normalizeFeatures(row.features_en),
    message_limit: Number(row.message_limit),
    user_limit: Number(row.user_limit),
    price_monthly: Number(row.price_monthly),
    price_yearly:
      row.price_yearly != null && row.price_yearly !== ''
        ? Number(row.price_yearly)
        : null,
    currency: typeof row.currency === 'string' ? row.currency.toUpperCase() : 'TRY',
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
  };
}

async function persistPlanEnglishTranslations(
  planId: string,
  content: { name: string; description: string | null; features: string[] }
): Promise<void> {
  try {
    const en = await translatePlanContentToEnglish(content);
    const { error } = await adminClient
      .from('subscription_plans')
      .update({
        name_en: en.name_en,
        description_en: en.description_en,
        features_en: en.features_en,
      })
      .eq('id', planId);

    if (error) {
      console.error('[plan-translation] persist failed:', planId, error.message);
    }
  } catch (err) {
    console.error('[plan-translation] translate failed:', planId, err);
  }
}

/** Eksik İngilizce alanları tamamlar (fiyatlar sayfası ilk yükleme). */
export async function ensurePlanEnglishTranslations(
  plan: SubscriptionPlanRow
): Promise<SubscriptionPlanRow> {
  if (!planNeedsEnglishTranslation(plan)) return plan;

  try {
    const en = await translatePlanContentToEnglish({
      name: plan.name,
      description: plan.description,
      features: plan.features,
    });

    const { data, error } = await adminClient
      .from('subscription_plans')
      .update({
        name_en: en.name_en,
        description_en: en.description_en,
        features_en: en.features_en,
      })
      .eq('id', plan.id)
      .select()
      .single();

    if (error || !data) return plan;
    return mapPlanRow(data as Record<string, unknown>);
  } catch (err) {
    console.error('[plan-translation] ensure failed:', plan.id, err);
    return plan;
  }
}

export async function getAllSubscriptionPlans(): Promise<SubscriptionPlanRow[]> {
  const { data, error } = await adminClient
    .from('subscription_plans')
    .select('*')
    .order('price_monthly', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map((row) => mapPlanRow(row as Record<string, unknown>));
}

export async function updateSubscriptionPlan(
  planId: string,
  updates: UpdateSubscriptionPlanInput
): Promise<SubscriptionPlanRow> {
  const payload: Record<string, unknown> = {};

  if (updates.name !== undefined) {
    const name = updates.name.trim();
    if (!name) throw new Error('Paket adı zorunludur');
    payload.name = name;
  }
  if (updates.description !== undefined) {
    payload.description = updates.description?.trim() || null;
  }
  if (updates.features !== undefined) {
    payload.features = normalizeFeatures(updates.features);
  }
  if (updates.message_limit !== undefined) {
    if (!Number.isFinite(updates.message_limit) || updates.message_limit < 1) {
      throw new Error('AI görüşme limiti en az 1 olmalıdır');
    }
    payload.message_limit = Math.floor(updates.message_limit);
  }
  if (updates.user_limit !== undefined) {
    if (!Number.isFinite(updates.user_limit) || updates.user_limit < 1) {
      throw new Error('Kullanıcı limiti en az 1 olmalıdır');
    }
    payload.user_limit = Math.floor(updates.user_limit);
  }
  if (updates.price_monthly !== undefined) {
    if (!Number.isFinite(updates.price_monthly) || updates.price_monthly < 0) {
      throw new Error('Aylık fiyat 0 veya daha büyük olmalıdır');
    }
    payload.price_monthly = updates.price_monthly;
  }
  if (updates.price_yearly !== undefined) {
    if (updates.price_yearly === null) {
      payload.price_yearly = null;
    } else if (!Number.isFinite(updates.price_yearly) || updates.price_yearly < 0) {
      throw new Error('Yıllık fiyat 0 veya daha büyük olmalıdır');
    } else {
      payload.price_yearly = updates.price_yearly;
    }
  }
  if (updates.currency !== undefined) {
    const currency = updates.currency.trim().toUpperCase();
    if (!ALLOWED_CURRENCIES.has(currency)) {
      throw new Error('Geçersiz para birimi. Desteklenen: TRY, USD, EUR, GBP');
    }
    payload.currency = currency;
  }
  if (updates.is_active !== undefined) {
    payload.is_active = updates.is_active;
  }

  if (Object.keys(payload).length === 0) {
    throw new Error('Güncellenecek alan bulunamadı');
  }

  const { data, error } = await adminClient
    .from('subscription_plans')
    .update(payload)
    .eq('id', planId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  const mapped = mapPlanRow(data as Record<string, unknown>);
  let result = mapped;

  if (
    updates.name !== undefined ||
    updates.description !== undefined ||
    updates.features !== undefined
  ) {
    await persistPlanEnglishTranslations(mapped.id, {
      name: mapped.name,
      description: mapped.description,
      features: mapped.features,
    });
    const { data: refreshed } = await adminClient
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .single();
    if (refreshed) {
      result = mapPlanRow(refreshed as Record<string, unknown>);
    }
  }

  if (updates.sync_subscriptions) {
    const { error: syncError } = await adminClient
      .from('subscriptions')
      .update({
        messages_limit: result.message_limit,
        users_limit: result.user_limit,
      })
      .eq('plan_id', planId);

    if (syncError) throw new Error(syncError.message);
  }

  return result;
}

export async function createSubscriptionPlan(
  input: CreateSubscriptionPlanInput
): Promise<SubscriptionPlanRow> {
  const planType = normalizePlanType(input.plan_type);
  if (!PLAN_TYPE_PATTERN.test(planType)) {
    throw new Error(
      'Paket kodu küçük harf ile başlamalı; harf, rakam ve alt çizgi içerebilir (2-49 karakter)'
    );
  }

  const name = input.name.trim();
  if (!name) throw new Error('Paket adı zorunludur');

  if (!Number.isFinite(input.message_limit) || input.message_limit < 1) {
    throw new Error('AI görüşme limiti en az 1 olmalıdır');
  }
  if (!Number.isFinite(input.user_limit) || input.user_limit < 1) {
    throw new Error('Kullanıcı limiti en az 1 olmalıdır');
  }
  if (!Number.isFinite(input.price_monthly) || input.price_monthly < 0) {
    throw new Error('Aylık fiyat 0 veya daha büyük olmalıdır');
  }

  let priceYearly: number | null = null;
  if (input.price_yearly != null) {
    if (!Number.isFinite(input.price_yearly) || input.price_yearly < 0) {
      throw new Error('Yıllık fiyat 0 veya daha büyük olmalıdır');
    }
    priceYearly = input.price_yearly;
  }

  const currency = (input.currency || 'TRY').trim().toUpperCase();
  if (!ALLOWED_CURRENCIES.has(currency)) {
    throw new Error('Geçersiz para birimi. Desteklenen: TRY, USD, EUR, GBP');
  }

  const { data, error } = await adminClient
    .from('subscription_plans')
    .insert({
      plan_type: planType,
      name,
      description: input.description?.trim() || null,
      features: normalizeFeatures(input.features),
      message_limit: Math.floor(input.message_limit),
      user_limit: Math.floor(input.user_limit),
      price_monthly: input.price_monthly,
      price_yearly: priceYearly,
      currency,
      is_active: input.is_active !== false,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Bu paket kodu zaten kullanılıyor');
    }
    throw new Error(error.message);
  }

  const mapped = mapPlanRow(data as Record<string, unknown>);
  await persistPlanEnglishTranslations(mapped.id, {
    name: mapped.name,
    description: mapped.description,
    features: mapped.features,
  });

  const { data: refreshed } = await adminClient
    .from('subscription_plans')
    .select('*')
    .eq('id', mapped.id)
    .single();

  return refreshed ? mapPlanRow(refreshed as Record<string, unknown>) : mapped;
}

export async function getPlanLimitsByType(
  planType: string
): Promise<{ message_limit: number; user_limit: number } | null> {
  const { data, error } = await adminClient
    .from('subscription_plans')
    .select('message_limit, user_limit')
    .eq('plan_type', planType)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function getActivePublicPlans(): Promise<SubscriptionPlanRow[]> {
  const { data, error } = await adminClient
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true });

  if (error) throw new Error(error.message);

  const plans = (data || []).map((row) => mapPlanRow(row as Record<string, unknown>));
  return Promise.all(plans.map((plan) => ensurePlanEnglishTranslations(plan)));
}
