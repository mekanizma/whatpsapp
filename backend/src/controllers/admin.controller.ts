/**
 * Admin controller — platform yönetimi
 */

import { Response } from 'express';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { demoCompany } from '../demo/mockData';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../services/log.service';
import {
  getExtendedPlatformStats,
  getCompaniesWithUsage,
  getCompanyDetail,
  updateCompanyAdmin,
  updateSubscriptionAdmin,
  createCompanyAdminUser,
  getPlatformAIUsage,
  getActivityLogs,
  PLAN_LIMITS,
} from '../services/admin.service';

export async function getCompanies(req: AuthRequest, res: Response): Promise<void> {
  if (config.demoMode) {
    res.json({
      success: true,
      data: [{ ...demoCompany, message_count: 0, ai_tokens_month: 0 }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    return;
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const search = (req.query.search as string) || '';

  try {
    const result = await getCompaniesWithUsage(page, limit, search);
    res.json({ success: true, data: result.companies, pagination: result.pagination });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function getCompany(req: AuthRequest, res: Response): Promise<void> {
  try {
    const detail = await getCompanyDetail(req.params.id as string);
    res.json({ success: true, data: detail });
  } catch (err) {
    res.status(404).json({ success: false, error: err instanceof Error ? err.message : 'Bulunamadı' });
  }
}

export async function createCompany(req: AuthRequest, res: Response): Promise<void> {
  const {
    company_name,
    category,
    phone,
    email,
    address,
    subscription_plan,
    admin_email,
    admin_password,
    admin_full_name,
  } = req.body;

  if (!company_name?.trim()) {
    res.status(400).json({ success: false, error: 'Şirket adı gerekli' });
    return;
  }

  const plan = subscription_plan || 'starter';
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;

  const { data: company, error } = await adminClient
    .from('companies')
    .insert({
      company_name: company_name.trim(),
      category: category || 'diger',
      phone: phone || null,
      email: email || null,
      address: address || null,
      subscription_plan: plan,
      status: 'trial',
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  const { data: planRow } = await adminClient
    .from('subscription_plans')
    .select('id')
    .eq('plan_type', plan)
    .single();

  if (planRow) {
    await adminClient.from('subscriptions').insert({
      company_id: company.id,
      plan_id: planRow.id,
      messages_limit: limits.messages,
      users_limit: limits.users,
      status: 'trial',
    });
  }

  await adminClient.from('whatsapp_configs').insert({ company_id: company.id });

  let adminUserId: string | null = null;
  if (admin_email && admin_password && admin_full_name) {
    try {
      adminUserId = await createCompanyAdminUser(
        company.id,
        admin_email,
        admin_password,
        admin_full_name
      );
    } catch (userErr) {
      console.error('Şirket admin kullanıcı hatası:', userErr);
    }
  }

  await logActivity({
    userId: req.userId,
    action: 'company_created',
    entityType: 'company',
    entityId: company.id,
    metadata: { company_name, admin_email, admin_user_id: adminUserId },
  });

  res.status(201).json({ success: true, data: { company, admin_user_id: adminUserId } });
}

export async function updateCompany(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await updateCompanyAdmin(req.params.id as string, req.body);
    await logActivity({
      userId: req.userId,
      action: 'company_updated',
      entityType: 'company',
      entityId: data.id,
      metadata: req.body,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function updateCompanySubscription(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await updateSubscriptionAdmin(req.params.id as string, req.body);
    await logActivity({
      userId: req.userId,
      companyId: req.params.id as string,
      action: 'subscription_updated',
      entityType: 'subscription',
      metadata: req.body,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function updateCompanyStatus(req: AuthRequest, res: Response): Promise<void> {
  const { status } = req.body;
  try {
    const data = await updateCompanyAdmin(req.params.id as string, { status });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function getAdminStats(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const stats = await getExtendedPlatformStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: 'İstatistik alınamadı' });
  }
}

export async function getAIUsage(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await getPlatformAIUsage();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function getLogs(req: AuthRequest, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const companyId = req.query.company_id as string | undefined;
  try {
    const result = await getActivityLogs(page, 40, companyId);
    res.json({ success: true, data: result.logs, pagination: result.pagination });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function getPlatformSettings(_req: AuthRequest, res: Response): Promise<void> {
  res.json({
    success: true,
    data: {
      demo_mode: config.demoMode,
      ai_model: config.openai.model,
      ai_max_tokens: config.ai.maxTokens,
      ai_cache_enabled: config.ai.cacheEnabled,
      node_env: config.nodeEnv,
      supabase_connected: !config.demoMode,
      whatsapp_worker: !!config.whatsapp.workerUrl,
    },
  });
}
