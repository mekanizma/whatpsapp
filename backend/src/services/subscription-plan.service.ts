/**
 * Subscription plan management (super admin)
 */

import { adminClient } from '../database/supabase';

export interface SubscriptionPlanRow {
  id: string;
  plan_type: string;
  name: string;
  description: string | null;
  features: string[];
  message_limit: number;
  user_limit: number;
  price_monthly: number;
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
  currency?: string;
  is_active?: boolean;
  sync_subscriptions?: boolean;
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
    description: typeof row.description === 'string' ? row.description : null,
    features: normalizeFeatures(row.features),
    message_limit: Number(row.message_limit),
    user_limit: Number(row.user_limit),
    price_monthly: Number(row.price_monthly),
    currency: typeof row.currency === 'string' ? row.currency.toUpperCase() : 'TRY',
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
  };
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
      throw new Error('Mesaj limiti en az 1 olmalıdır');
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
      throw new Error('Fiyat 0 veya daha büyük olmalıdır');
    }
    payload.price_monthly = updates.price_monthly;
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

  if (updates.sync_subscriptions) {
    const { error: syncError } = await adminClient
      .from('subscriptions')
      .update({
        messages_limit: data.message_limit,
        users_limit: data.user_limit,
      })
      .eq('plan_id', planId);

    if (syncError) throw new Error(syncError.message);
  }

  return mapPlanRow(data as Record<string, unknown>);
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
