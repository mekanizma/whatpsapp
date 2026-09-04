/**
 * Company-scoped phone blacklist — blocked numbers cannot send inbound messages.
 */

import { adminClient } from '../database/supabase';

export async function isPhoneBlacklisted(
  companyId: string,
  phone: string
): Promise<boolean> {
  const { data, error } = await adminClient
    .from('phone_blacklist')
    .select('id')
    .eq('company_id', companyId)
    .eq('phone', phone)
    .maybeSingle();

  if (error) {
    console.error('[Blacklist] Check failed:', error.message);
    return false;
  }

  return !!data;
}

export async function addPhoneToBlacklist(
  companyId: string,
  phone: string,
  createdBy?: string | null
): Promise<{ phone: string; created_at: string }> {
  const { data, error } = await adminClient
    .from('phone_blacklist')
    .upsert(
      {
        company_id: companyId,
        phone,
        created_by: createdBy || null,
      },
      { onConflict: 'company_id,phone' }
    )
    .select('phone, created_at')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function removePhoneFromBlacklist(
  companyId: string,
  phone: string
): Promise<boolean> {
  const { error, count } = await adminClient
    .from('phone_blacklist')
    .delete({ count: 'exact' })
    .eq('company_id', companyId)
    .eq('phone', phone);

  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}
