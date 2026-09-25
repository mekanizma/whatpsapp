/**
 * Meta onaylı müşteri outreach şablonu — 24s pencere dışı / yeni konuşma
 */

import { config } from '../config';
import { adminClient } from '../database/supabase';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  getStaffRecord,
  staffCanAccessCustomerPhone,
  staffHasCompanyWideSupportAccess,
} from './department-access.service';

export type WaOutreachTemplateConfig = {
  enabled: boolean;
  name: string;
  language: string;
  body: string;
};

const DEFAULT_BODY =
  'Hi! 👋 We are very happy that you are interested in Final International University (FIU)!\n' +
  'Simply reply to this message. We are here to answer all your questions!';

export async function getWaOutreachTemplateConfig(
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
