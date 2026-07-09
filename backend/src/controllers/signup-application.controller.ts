/**
 * Kayıt başvuruları controller — herkese açık gönderim + admin yönetimi
 */

import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../services/log.service';
import { validateCompanyCategoryForWrite, DEFAULT_COMPANY_CATEGORY } from '../constants/company-categories';
import {
  createSignupApplication,
  listSignupApplicationsAdmin,
  updateSignupApplicationAdmin,
  provisionCompanyFromSignupApplication,
  type SignupApplicationStatus,
} from '../services/signup-application.service';
import { generateCaptcha, verifyCaptcha } from '../services/captcha.service';

const VALID_STATUSES: SignupApplicationStatus[] = ['pending', 'reviewed', 'approved', 'rejected'];

export async function getSignupCaptcha(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: generateCaptcha() });
}

export async function submitSignupApplication(req: Request, res: Response): Promise<void> {
  const company_name = String(req.body?.company_name || '').trim();
  const full_name = String(req.body?.full_name || '').trim();
  const email = String(req.body?.email || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const categoryRaw = String(req.body?.category || DEFAULT_COMPANY_CATEGORY).trim();
  const categoryValidated = validateCompanyCategoryForWrite(categoryRaw);
  if (!categoryValidated.ok) {
    res.status(400).json({ success: false, error: categoryValidated.error });
    return;
  }
  const category = categoryValidated.category;
  const subscription_plan_id = String(req.body?.subscription_plan_id || '').trim();
  const billing_period = String(req.body?.billing_period || 'monthly').trim();
  const captcha_token = String(req.body?.captcha_token || '');
  const captcha_answer = String(req.body?.captcha_answer || '');

  if (!company_name || !full_name || !email || !subscription_plan_id) {
    res.status(400).json({
      success: false,
      error: 'İşletme adı, ad soyad, e-posta ve paket seçimi zorunludur',
    });
    return;
  }

  if (billing_period !== 'monthly' && billing_period !== 'yearly') {
    res.status(400).json({ success: false, error: 'Geçersiz fatura dönemi' });
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, error: 'Geçerli bir e-posta adresi girin' });
    return;
  }

  if (!verifyCaptcha(captcha_token, captcha_answer)) {
    res.status(400).json({
      success: false,
      error: 'Güvenlik doğrulaması hatalı veya süresi doldu. Lütfen tekrar deneyin.',
      code: 'captcha_failed',
    });
    return;
  }

  try {
    const data = await createSignupApplication({
      company_name,
      full_name,
      email,
      phone: phone || undefined,
      category,
      subscription_plan_id,
      billing_period: billing_period as 'monthly' | 'yearly',
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Başvuru kaydedilemedi',
    });
  }
}

export async function adminListSignupApplications(req: AuthRequest, res: Response): Promise<void> {
  try {
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;

    const result = await listSignupApplicationsAdmin({ status, search, page, limit });
    res.json({
      success: true,
      data: result.applications,
      pagination: result.pagination,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Başvurular alınamadı',
    });
  }
}

export async function adminUpdateSignupApplication(req: AuthRequest, res: Response): Promise<void> {
  const id = String(req.params.id);
  const status = req.body?.status as SignupApplicationStatus | undefined;
  const admin_notes = req.body?.admin_notes as string | null | undefined;

  if (status && !VALID_STATUSES.includes(status)) {
    res.status(400).json({ success: false, error: 'Geçersiz durum' });
    return;
  }

  try {
    const data = await updateSignupApplicationAdmin(id, { status, admin_notes });
    await logActivity({
      userId: req.userId,
      action: 'signup_application_updated',
      entityType: 'signup_application',
      entityId: id,
      metadata: { status: data.status },
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Başvuru güncellenemedi',
    });
  }
}

export async function adminProvisionSignupApplication(req: AuthRequest, res: Response): Promise<void> {
  const id = String(req.params.id);

  try {
    const data = await provisionCompanyFromSignupApplication(id);
    await logActivity({
      userId: req.userId,
      action: 'signup_application_provisioned',
      entityType: 'signup_application',
      entityId: id,
      metadata: { company_id: data.company_id },
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Hesap oluşturulamadı',
    });
  }
}
