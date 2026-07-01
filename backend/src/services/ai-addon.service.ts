/**
 * Ek AI görüşme paketleri yönetimi
 */

import { adminClient } from '../database/supabase';

const ALLOWED_CURRENCIES = new Set(['TRY', 'USD', 'EUR', 'GBP']);

export interface AiConversationAddonRow {
  id: string;
  name: string;
  conversation_count: number;
  price: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function mapAddonRow(row: Record<string, unknown>): AiConversationAddonRow {
  return {
    id: String(row.id),
    name: String(row.name),
    conversation_count: Number(row.conversation_count),
    price: Number(row.price),
    currency: typeof row.currency === 'string' ? row.currency.toUpperCase() : 'TRY',
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order) || 0,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function getAllAiConversationAddons(): Promise<AiConversationAddonRow[]> {
  const { data, error } = await adminClient
    .from('ai_conversation_addons')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('conversation_count', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map((row) => mapAddonRow(row as Record<string, unknown>));
}

export async function getActiveAiConversationAddons(): Promise<AiConversationAddonRow[]> {
  const { data, error } = await adminClient
    .from('ai_conversation_addons')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('conversation_count', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map((row) => mapAddonRow(row as Record<string, unknown>));
}

export interface UpdateAiConversationAddonInput {
  name?: string;
  conversation_count?: number;
  price?: number;
  currency?: string;
  is_active?: boolean;
  sort_order?: number;
}

export async function updateAiConversationAddon(
  addonId: string,
  updates: UpdateAiConversationAddonInput
): Promise<AiConversationAddonRow> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.name !== undefined) {
    const name = updates.name.trim();
    if (!name) throw new Error('Paket adı zorunludur');
    payload.name = name;
  }
  if (updates.conversation_count !== undefined) {
    if (!Number.isFinite(updates.conversation_count) || updates.conversation_count < 1) {
      throw new Error('Görüşme adedi en az 1 olmalıdır');
    }
    payload.conversation_count = Math.floor(updates.conversation_count);
  }
  if (updates.price !== undefined) {
    if (!Number.isFinite(updates.price) || updates.price < 0) {
      throw new Error('Fiyat 0 veya daha büyük olmalıdır');
    }
    payload.price = updates.price;
  }
  if (updates.currency !== undefined) {
    const currency = updates.currency.trim().toUpperCase();
    if (!ALLOWED_CURRENCIES.has(currency)) {
      throw new Error('Geçersiz para birimi');
    }
    payload.currency = currency;
  }
  if (updates.is_active !== undefined) payload.is_active = updates.is_active;
  if (updates.sort_order !== undefined) payload.sort_order = Math.floor(updates.sort_order);

  if (Object.keys(payload).length <= 1) {
    throw new Error('Güncellenecek alan bulunamadı');
  }

  const { data, error } = await adminClient
    .from('ai_conversation_addons')
    .update(payload)
    .eq('id', addonId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapAddonRow(data as Record<string, unknown>);
}

export async function purchaseAiConversationAddon(
  companyId: string,
  addonId: string
): Promise<{ messages_limit: number; messages_used: number; addon: AiConversationAddonRow }> {
  const { data: addon, error: addonError } = await adminClient
    .from('ai_conversation_addons')
    .select('*')
    .eq('id', addonId)
    .eq('is_active', true)
    .single();

  if (addonError || !addon) {
    throw new Error('Ek AI görüşme paketi bulunamadı veya aktif değil');
  }

  const { data: sub, error: subError } = await adminClient
    .from('subscriptions')
    .select('id, messages_used, messages_limit')
    .eq('company_id', companyId)
    .single();

  if (subError || !sub) throw new Error('Abonelik bulunamadı');

  const newLimit = Number(sub.messages_limit) + Number(addon.conversation_count);

  const { data: updated, error: updateError } = await adminClient
    .from('subscriptions')
    .update({ messages_limit: newLimit })
    .eq('company_id', companyId)
    .select('messages_used, messages_limit')
    .single();

  if (updateError) throw new Error(updateError.message);

  const { error: purchaseError } = await adminClient.from('ai_conversation_addon_purchases').insert({
    company_id: companyId,
    addon_id: addonId,
    conversation_count: addon.conversation_count,
    price_paid: addon.price,
    currency: addon.currency,
  });

  if (purchaseError) throw new Error(purchaseError.message);

  return {
    messages_limit: updated.messages_limit,
    messages_used: updated.messages_used,
    addon: mapAddonRow(addon as Record<string, unknown>),
  };
}

export function isQuotaExhausted(messagesUsed: number, messagesLimit: number): boolean {
  if (messagesLimit >= 999999) return false;
  return messagesUsed >= messagesLimit;
}
