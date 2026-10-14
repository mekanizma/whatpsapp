/**
 * Meta onaylı müşteri outreach şablonu — 24s pencere dışı / yeni konuşma
 * Hat bazlı tanımlar + şirket / env yedekleri
 */

import { config } from '../config';
import { adminClient } from '../database/supabase';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  getStaffRecord,
  staffCanAccessCustomerPhone,
  staffHasCompanyWideSupportAccess,
} from './department-access.service';
import { isSuperStaffRole } from './staff-permissions.service';

export type WaOutreachTemplateConfig = {
  enabled: boolean;
  name: string;
  language: string;
  body: string;
};

export type WaOutreachTemplateRow = {
  id: string;
  company_id: string;
  whatsapp_account_id: string;
  title: string;
  template_name: string;
  language: string;
  body: string;
  sort_order: number;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  whatsapp_account?: {
    id: string;
    label: string | null;
    phone_number: string | null;
    profile_name: string | null;
  } | null;
};

const DEFAULT_BODY =
  'Hi! 👋 We are very happy that you are interested in Final International University (FIU)!\n' +
  'Simply reply to this message. We are here to answer all your questions!';

/** Şirket kolonları / env yedeği */
export async function getCompanyWaOutreachFallback(
  companyId: string
): Promise<WaOutreachTemplateConfig> {
  const { data } = await adminClient
    .from('companies')
    .select('wa_outreach_template_name, wa_outreach_template_lang, wa_outreach_template_body')
    .eq('id', companyId)
    .maybeSingle();

  const name =
    (data?.wa_outreach_template_name as string | null)?.trim() ||
    config.whatsapp.customerOutreachTemplateName;
  const language =
    (data?.wa_outreach_template_lang as string | null)?.trim() ||
    config.whatsapp.customerOutreachTemplateLang;
  const body =
    (data?.wa_outreach_template_body as string | null)?.trim() ||
    config.whatsapp.customerOutreachTemplateBody ||
    DEFAULT_BODY;

  return {
    enabled: !!name,
    name,
    language: language || 'en',
    body,
  };
}

/** @deprecated use getCompanyWaOutreachFallback — geriye uyumluluk */
export async function getWaOutreachTemplateConfig(
  companyId: string
): Promise<WaOutreachTemplateConfig> {
  return getCompanyWaOutreachFallback(companyId);
}

export async function listWaOutreachTemplates(
  companyId: string,
  options?: { activeOnly?: boolean; accountId?: string | null }
): Promise<WaOutreachTemplateRow[]> {
  let query = adminClient
    .from('wa_outreach_templates')
    .select(
      '*, whatsapp_account:whatsapp_account_id(id, label, phone_number, profile_name)'
    )
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (options?.activeOnly) {
    query = query.eq('is_active', true);
  }
  if (options?.accountId) {
    query = query.eq('whatsapp_account_id', options.accountId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return (data || []) as WaOutreachTemplateRow[];
}

export async function getWaOutreachTemplateById(
  companyId: string,
  templateId: string
): Promise<WaOutreachTemplateRow | null> {
  const { data } = await adminClient
    .from('wa_outreach_templates')
    .select(
      '*, whatsapp_account:whatsapp_account_id(id, label, phone_number, profile_name)'
    )
    .eq('company_id', companyId)
    .eq('id', templateId)
    .maybeSingle();

  return (data as WaOutreachTemplateRow | null) || null;
}

/**
 * Gönderim için şablon çözümü:
 * 1) templateId verilmişse o kayıt
 * 2) hat için aktif şablonlar (ilk)
 * 3) şirket / env yedeği
 */
export async function resolveWaOutreachForSend(
  companyId: string,
  options?: { templateId?: string | null; accountId?: string | null }
): Promise<{
  name: string;
  language: string;
  body: string;
  title?: string;
  templateId?: string;
  accountId?: string | null;
  source: 'line' | 'company_fallback';
} | null> {
  if (options?.templateId) {
    const row = await getWaOutreachTemplateById(companyId, options.templateId);
    if (!row || !row.is_active) return null;
    if (options.accountId && row.whatsapp_account_id !== options.accountId) {
      return null;
    }
    return {
      name: row.template_name.trim(),
      language: (row.language || 'en').trim() || 'en',
      body: row.body.trim(),
      title: row.title,
      templateId: row.id,
      accountId: row.whatsapp_account_id,
      source: 'line',
    };
  }

  if (options?.accountId) {
    const lineTemplates = await listWaOutreachTemplates(companyId, {
      activeOnly: true,
      accountId: options.accountId,
    });
    if (lineTemplates.length > 0) {
      const row = lineTemplates[0];
      return {
        name: row.template_name.trim(),
        language: (row.language || 'en').trim() || 'en',
        body: row.body.trim(),
        title: row.title,
        templateId: row.id,
        accountId: row.whatsapp_account_id,
        source: 'line',
      };
    }
  }

  const fallback = await getCompanyWaOutreachFallback(companyId);
  if (!fallback.enabled || !fallback.name) return null;

  return {
    name: fallback.name,
    language: fallback.language,
    body: fallback.body,
    accountId: options?.accountId || null,
    source: 'company_fallback',
  };
}

export async function companyHasAnyWaOutreach(companyId: string): Promise<boolean> {
  const { count } = await adminClient
    .from('wa_outreach_templates')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (count && count > 0) return true;

  const fallback = await getCompanyWaOutreachFallback(companyId);
  return fallback.enabled;
}

export async function assertWhatsAppAccountBelongsToCompany(
  companyId: string,
  accountId: string
): Promise<boolean> {
  const { data } = await adminClient
    .from('whatsapp_configs')
    .select('id')
    .eq('id', accountId)
    .eq('company_id', companyId)
    .maybeSingle();
  return !!data;
}

/** Şirket yöneticisi / süper personel — şablon CRUD */
export function canUserManageWaOutreachTemplates(req: AuthRequest): boolean {
  if (!req.companyId) return false;
  if (req.role === 'company_admin' || req.role === 'super_admin') return true;
  if (req.role !== 'staff') return false;
  return isSuperStaffRole(req.staffRole);
}

/** Şirket yöneticisi / süper personel her zaman; atanmış agent mevcut görüşmede */
export async function canUserSendWaOutreach(
  req: AuthRequest,
  customerPhone: string
): Promise<boolean> {
  if (!req.companyId) return false;

  if (req.role === 'company_admin' || req.role === 'super_admin') return true;
  if (req.role !== 'staff') return false;

  const staff = await getStaffRecord(req.companyId, req.profile?.id);
  if (!staff) return false;
  if (staffHasCompanyWideSupportAccess(staff)) return true;

  return staffCanAccessCustomerPhone(req.companyId, req.profile?.id, customerPhone);
}

/** Yeni numara (geçmiş yok) — yalnızca yönetici / süper personel */
export async function canUserStartWaOutreach(req: AuthRequest): Promise<boolean> {
  if (!req.companyId) return false;
  if (req.role === 'company_admin' || req.role === 'super_admin') return true;
  if (req.role !== 'staff') return false;

  const staff = await getStaffRecord(req.companyId, req.profile?.id);
  return staffHasCompanyWideSupportAccess(staff);
}
