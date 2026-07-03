/**
 * WhatsApp account management — multi-line per company with plan limits
 */

import { adminClient } from '../database/supabase';
import { SubscriptionPlanType, WhatsAppAccount, WhatsAppStatus, Department } from '../types';

export const WHATSAPP_LINE_LIMITS: Record<SubscriptionPlanType, number> = {
  starter: 1,
  business: 3,
  enterprise: 999,
};

export interface WhatsAppAccountView extends WhatsAppAccount {
  departments: Department[];
  connection_type: 'qr' | 'api' | null;
  reconnecting?: boolean;
  live_connected?: boolean;
}

export async function getCompanyPlanType(companyId: string): Promise<SubscriptionPlanType> {
  const { data } = await adminClient
    .from('companies')
    .select('subscription_plan')
    .eq('id', companyId)
    .single();
  return (data?.subscription_plan as SubscriptionPlanType) || 'starter';
}

export function getWhatsAppLineLimit(planType: SubscriptionPlanType): number {
  return WHATSAPP_LINE_LIMITS[planType] ?? WHATSAPP_LINE_LIMITS.starter;
}

export async function countWhatsAppAccounts(companyId: string): Promise<number> {
  const { count } = await adminClient
    .from('whatsapp_configs')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);
  return count || 0;
}

export async function assertCanAddWhatsAppAccount(companyId: string): Promise<void> {
  const planType = await getCompanyPlanType(companyId);
  const limit = getWhatsAppLineLimit(planType);
  const current = await countWhatsAppAccounts(companyId);
  if (current >= limit) {
    throw new Error(
      `Paket limitinize ulaştınız (${limit} WhatsApp). Daha fazla hat için paketinizi yükseltin.`
    );
  }
}

async function fetchDepartmentLinks(accountIds: string[]): Promise<Map<string, Department[]>> {
  const map = new Map<string, Department[]>();
  if (!accountIds.length) return map;

  const { data: links } = await adminClient
    .from('whatsapp_department_links')
    .select('whatsapp_account_id, departments(*)')
    .in('whatsapp_account_id', accountIds);

  for (const link of links || []) {
    const accountId = link.whatsapp_account_id as string;
    const dept = link.departments as unknown as Department | Department[] | null;
    const row = Array.isArray(dept) ? dept[0] : dept;
    if (!row) continue;
    const list = map.get(accountId) || [];
    list.push(row);
    map.set(accountId, list);
  }
  return map;
}

function resolveConnectionType(account: WhatsAppAccount): 'qr' | 'api' | null {
  if (account.business_account_id?.startsWith('baileys:')) return 'qr';
  if (account.access_token && account.business_account_id) return 'api';
  return null;
}

export async function listWhatsAppAccounts(companyId: string): Promise<WhatsAppAccountView[]> {
  const { data, error } = await adminClient
    .from('whatsapp_configs')
    .select(
      'id, company_id, label, phone_number, profile_name, business_account_id, status, is_active, is_default, last_synced_at, created_at, updated_at'
    )
    .eq('company_id', companyId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  const accounts = (data || []) as WhatsAppAccount[];
  const deptMap = await fetchDepartmentLinks(accounts.map((a) => a.id));

  return accounts.map((account) => ({
    ...account,
    departments: deptMap.get(account.id) || [],
    connection_type: resolveConnectionType(account),
  }));
}

export async function getWhatsAppAccount(
  companyId: string,
  accountId: string
): Promise<WhatsAppAccount | null> {
  const { data } = await adminClient
    .from('whatsapp_configs')
    .select('*')
    .eq('id', accountId)
    .eq('company_id', companyId)
    .single();
  return (data as WhatsAppAccount) || null;
}

export async function getDefaultWhatsAppAccount(companyId: string): Promise<WhatsAppAccount | null> {
  const { data: defaultRow } = await adminClient
    .from('whatsapp_configs')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_default', true)
    .maybeSingle();

  if (defaultRow) return defaultRow as WhatsAppAccount;

  const { data: first } = await adminClient
    .from('whatsapp_configs')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return (first as WhatsAppAccount) || null;
}

export async function createWhatsAppAccount(
  companyId: string,
  label?: string
): Promise<WhatsAppAccount> {
  await assertCanAddWhatsAppAccount(companyId);

  const count = await countWhatsAppAccounts(companyId);
  const isDefault = count === 0;

  const { data, error } = await adminClient
    .from('whatsapp_configs')
    .insert({
      company_id: companyId,
      label: label?.trim() || `WhatsApp ${count + 1}`,
      status: 'disconnected' as WhatsAppStatus,
      is_active: true,
      is_default: isDefault,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as WhatsAppAccount;
}

export async function updateWhatsAppAccount(
  companyId: string,
  accountId: string,
  updates: {
    label?: string;
    is_active?: boolean;
    is_default?: boolean;
    department_ids?: string[];
    phone_number?: string;
    business_account_id?: string;
    access_token?: string;
    webhook_verify_token?: string;
    status?: WhatsAppStatus;
    profile_name?: string | null;
    last_synced_at?: string | null;
  }
): Promise<WhatsAppAccount> {
  const account = await getWhatsAppAccount(companyId, accountId);
  if (!account) throw new Error('WhatsApp hesabı bulunamadı');

  const patch: Record<string, unknown> = {};
  if (updates.label !== undefined) patch.label = updates.label.trim() || account.label;
  if (updates.is_active !== undefined) patch.is_active = updates.is_active;
  if (updates.phone_number !== undefined) patch.phone_number = updates.phone_number;
  if (updates.business_account_id !== undefined) patch.business_account_id = updates.business_account_id;
  if (updates.access_token !== undefined) patch.access_token = updates.access_token;
  if (updates.webhook_verify_token !== undefined) patch.webhook_verify_token = updates.webhook_verify_token;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.profile_name !== undefined) patch.profile_name = updates.profile_name;
  if (updates.last_synced_at !== undefined) patch.last_synced_at = updates.last_synced_at;

  if (updates.is_default === true) {
    await adminClient
      .from('whatsapp_configs')
      .update({ is_default: false })
      .eq('company_id', companyId)
      .neq('id', accountId);
    patch.is_default = true;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await adminClient
      .from('whatsapp_configs')
      .update(patch)
      .eq('id', accountId)
      .eq('company_id', companyId);
    if (error) throw new Error(error.message);
  }

  if (updates.department_ids !== undefined) {
    await setAccountDepartments(companyId, accountId, updates.department_ids);
  }

  const refreshed = await getWhatsAppAccount(companyId, accountId);
  if (!refreshed) throw new Error('WhatsApp hesabı güncellenemedi');
  return refreshed;
}

async function setAccountDepartments(
  companyId: string,
  accountId: string,
  departmentIds: string[]
): Promise<void> {
  const uniqueIds = [...new Set(departmentIds.filter(Boolean))];

  if (uniqueIds.length > 0) {
    const { data: valid } = await adminClient
      .from('departments')
      .select('id')
      .eq('company_id', companyId)
      .in('id', uniqueIds);
    const validIds = (valid || []).map((d) => d.id);
    if (validIds.length !== uniqueIds.length) {
      throw new Error('Geçersiz departman seçimi');
    }
  }

  await adminClient
    .from('whatsapp_department_links')
    .delete()
    .eq('whatsapp_account_id', accountId);

  if (uniqueIds.length > 0) {
    const { error } = await adminClient.from('whatsapp_department_links').insert(
      uniqueIds.map((department_id) => ({
        whatsapp_account_id: accountId,
        department_id,
      }))
    );
    if (error) throw new Error(error.message);
  }
}

export async function deleteWhatsAppAccount(companyId: string, accountId: string): Promise<void> {
  const accounts = await listWhatsAppAccounts(companyId);
  const target = accounts.find((a) => a.id === accountId);
  if (!target) throw new Error('WhatsApp hesabı bulunamadı');

  const { error } = await adminClient
    .from('whatsapp_configs')
    .delete()
    .eq('id', accountId)
    .eq('company_id', companyId);

  if (error) throw new Error(error.message);

  if (target.is_default && accounts.length > 1) {
    const next = accounts.find((a) => a.id !== accountId);
    if (next) {
      await adminClient
        .from('whatsapp_configs')
        .update({ is_default: true })
        .eq('id', next.id);
    }
  }
}

export async function resolveOutboundAccount(
  companyId: string,
  customerPhone: string
): Promise<WhatsAppAccount | null> {
  const { data: lastMsg } = await adminClient
    .from('messages')
    .select('whatsapp_account_id')
    .eq('company_id', companyId)
    .eq('customer_phone', customerPhone)
    .not('whatsapp_account_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastMsg?.whatsapp_account_id) {
    const account = await getWhatsAppAccount(companyId, lastMsg.whatsapp_account_id);
    if (account?.is_active) return account;
  }

  const { data: connected } = await adminClient
    .from('whatsapp_configs')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .eq('status', 'connected')
    .order('is_default', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connected) return connected as WhatsAppAccount;

  return getDefaultWhatsAppAccount(companyId);
}

export async function listDepartments(companyId: string): Promise<Department[]> {
  const { data, error } = await adminClient
    .from('departments')
    .select('*')
    .eq('company_id', companyId)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as Department[];
}

export async function createDepartment(
  companyId: string,
  name: string,
  description?: string
): Promise<Department> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Departman adı gerekli');

  const { data, error } = await adminClient
    .from('departments')
    .insert({
      company_id: companyId,
      name: trimmed,
      description: description?.trim() || null,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Bu departman adı zaten mevcut');
    throw new Error(error.message);
  }
  return data as Department;
}

export async function updateDepartment(
  companyId: string,
  departmentId: string,
  updates: { name?: string; description?: string; is_active?: boolean }
): Promise<Department> {
  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed) throw new Error('Departman adı boş olamaz');
    patch.name = trimmed;
  }
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
  if (updates.is_active !== undefined) patch.is_active = updates.is_active;

  const { data, error } = await adminClient
    .from('departments')
    .update(patch)
    .eq('id', departmentId)
    .eq('company_id', companyId)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Bu departman adı zaten mevcut');
    throw new Error(error.message);
  }
  return data as Department;
}

export async function deleteDepartment(companyId: string, departmentId: string): Promise<void> {
  const { error } = await adminClient
    .from('departments')
    .delete()
    .eq('id', departmentId)
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);
}
