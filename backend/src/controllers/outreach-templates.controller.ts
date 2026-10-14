/**
 * Hat bazlı Meta outreach şablon CRUD (süper personel / şirket yöneticisi)
 */

import { Response } from 'express';
import { adminClient } from '../database/supabase';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
import { logActivity } from '../services/log.service';
import {
  assertWhatsAppAccountBelongsToCompany,
  canUserManageWaOutreachTemplates,
  listWaOutreachTemplates,
} from '../services/wa-outreach-template.service';

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export async function getOutreachTemplates(req: AuthRequest, res: Response): Promise<void> {
  if (!req.companyId) {
    res.status(403).json({ success: false, error: 'Şirket bilgisi bulunamadı' });
    return;
  }

  if (isDemoSession(req)) {
    res.json({ success: true, data: [] });
    return;
  }

  const activeOnly =
    String(req.query.active || '') === '1' || String(req.query.active || '') === 'true';
  const accountId =
    typeof req.query.whatsapp_account_id === 'string'
      ? req.query.whatsapp_account_id.trim()
      : '';

  try {
    const data = await listWaOutreachTemplates(req.companyId, {
      activeOnly,
      accountId: accountId || null,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Şablonlar alınamadı',
    });
  }
}

export async function createOutreachTemplate(req: AuthRequest, res: Response): Promise<void> {
  if (!req.companyId) {
    res.status(403).json({ success: false, error: 'Şirket bilgisi bulunamadı' });
    return;
  }
  if (isDemoSession(req)) {
    res.status(403).json({ success: false, error: 'Demo oturumunda işlem yapılamaz' });
    return;
  }
  if (!canUserManageWaOutreachTemplates(req)) {
    res.status(403).json({ success: false, error: 'Şablon tanımlama yetkiniz yok' });
    return;
  }

  const title = String(req.body?.title || '').trim();
  const templateName = String(req.body?.template_name || '').trim();
  const language = String(req.body?.language || 'en').trim() || 'en';
  const body = String(req.body?.body || '').trim();
  const accountId = String(req.body?.whatsapp_account_id || '').trim();
  const sortOrder = Number.isFinite(Number(req.body?.sort_order))
    ? Math.max(0, Math.floor(Number(req.body.sort_order)))
    : 0;

  if (!title || !templateName || !body || !accountId) {
    res.status(400).json({
      success: false,
      error: 'Başlık, şablon adı, içerik ve hat seçimi zorunludur',
    });
    return;
  }

  const accountOk = await assertWhatsAppAccountBelongsToCompany(req.companyId, accountId);
  if (!accountOk) {
    res.status(400).json({ success: false, error: 'Geçersiz WhatsApp hattı' });
    return;
  }

  const { data, error } = await adminClient
    .from('wa_outreach_templates')
    .insert({
      company_id: req.companyId,
      whatsapp_account_id: accountId,
      title,
      template_name: templateName,
      language,
      body,
      sort_order: sortOrder,
      is_active: true,
      created_by: req.profile?.id || null,
    })
    .select(
      '*, whatsapp_account:whatsapp_account_id(id, label, phone_number, profile_name)'
    )
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'wa_outreach_template_created',
    entityType: 'wa_outreach_templates',
    entityId: data.id,
    metadata: { title, template_name: templateName, whatsapp_account_id: accountId },
  });

  res.status(201).json({ success: true, data });
}

export async function updateOutreachTemplate(req: AuthRequest, res: Response): Promise<void> {
  if (!req.companyId) {
    res.status(403).json({ success: false, error: 'Şirket bilgisi bulunamadı' });
    return;
  }
  if (isDemoSession(req)) {
    res.status(403).json({ success: false, error: 'Demo oturumunda işlem yapılamaz' });
    return;
  }
  if (!canUserManageWaOutreachTemplates(req)) {
    res.status(403).json({ success: false, error: 'Şablon düzenleme yetkiniz yok' });
    return;
  }

  const id = paramId(req.params.id);

  const { data: existing } = await adminClient
    .from('wa_outreach_templates')
    .select('id')
    .eq('id', id)
    .eq('company_id', req.companyId)
    .maybeSingle();

  if (!existing) {
    res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
    return;
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (req.body?.title !== undefined) {
    const title = String(req.body.title || '').trim();
    if (!title) {
      res.status(400).json({ success: false, error: 'Başlık boş olamaz' });
      return;
    }
    updates.title = title;
  }

  if (req.body?.template_name !== undefined) {
    const templateName = String(req.body.template_name || '').trim();
    if (!templateName) {
      res.status(400).json({ success: false, error: 'Şablon adı boş olamaz' });
      return;
    }
    updates.template_name = templateName;
  }

  if (req.body?.language !== undefined) {
    const language = String(req.body.language || '').trim() || 'en';
    updates.language = language;
  }

  if (req.body?.body !== undefined) {
    const body = String(req.body.body || '').trim();
    if (!body) {
      res.status(400).json({ success: false, error: 'İçerik boş olamaz' });
      return;
    }
    updates.body = body;
  }

  if (req.body?.sort_order !== undefined) {
    const sortOrder = Number(req.body.sort_order);
    if (!Number.isFinite(sortOrder)) {
      res.status(400).json({ success: false, error: 'Geçersiz sıra' });
      return;
    }
    updates.sort_order = Math.max(0, Math.floor(sortOrder));
  }

  if (req.body?.is_active !== undefined) {
    updates.is_active = Boolean(req.body.is_active);
  }

  if (req.body?.whatsapp_account_id !== undefined) {
    const accountId = String(req.body.whatsapp_account_id || '').trim();
    if (!accountId) {
      res.status(400).json({ success: false, error: 'Hat seçimi zorunludur' });
      return;
    }
    const accountOk = await assertWhatsAppAccountBelongsToCompany(req.companyId, accountId);
    if (!accountOk) {
      res.status(400).json({ success: false, error: 'Geçersiz WhatsApp hattı' });
      return;
    }
    updates.whatsapp_account_id = accountId;
  }

  const { data, error } = await adminClient
    .from('wa_outreach_templates')
    .update(updates)
    .eq('id', id)
    .eq('company_id', req.companyId)
    .select(
      '*, whatsapp_account:whatsapp_account_id(id, label, phone_number, profile_name)'
    )
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'wa_outreach_template_updated',
    entityType: 'wa_outreach_templates',
    entityId: id,
  });

  res.json({ success: true, data });
}

export async function deleteOutreachTemplate(req: AuthRequest, res: Response): Promise<void> {
  if (!req.companyId) {
    res.status(403).json({ success: false, error: 'Şirket bilgisi bulunamadı' });
    return;
  }
  if (isDemoSession(req)) {
    res.status(403).json({ success: false, error: 'Demo oturumunda işlem yapılamaz' });
    return;
  }
  if (!canUserManageWaOutreachTemplates(req)) {
    res.status(403).json({ success: false, error: 'Şablon silme yetkiniz yok' });
    return;
  }

  const id = paramId(req.params.id);

  const { data: existing } = await adminClient
    .from('wa_outreach_templates')
    .select('id')
    .eq('id', id)
    .eq('company_id', req.companyId)
    .maybeSingle();

  if (!existing) {
    res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
    return;
  }

  const { error } = await adminClient
    .from('wa_outreach_templates')
    .delete()
    .eq('id', id)
    .eq('company_id', req.companyId);

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'wa_outreach_template_deleted',
    entityType: 'wa_outreach_templates',
    entityId: id,
  });

  res.json({ success: true, data: { id } });
}
