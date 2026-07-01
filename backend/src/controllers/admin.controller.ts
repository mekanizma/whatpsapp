/**
 * Admin controller — platform yönetimi
 */

import { Response } from 'express';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { demoCompany, demoPlans } from '../demo/mockData';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
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
import {
  listPromptTemplates,
  getPromptTemplate,
  createPromptTemplate,
  updatePromptTemplate,
  resetPromptToDefault,
  resetAllPromptsToDefault,
  cleanupAndReseedPrompts,
  deletePromptTemplate,
  seedDefaultPrompts,
  CORE_PROMPT_ROLES,
  PROMPT_ROLE_META,
} from '../services/prompt.service';
import {
  getAllSubscriptionPlans,
  updateSubscriptionPlan,
} from '../services/subscription-plan.service';

export async function getCompanies(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
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
      live_mode: !config.demoMode,
      ai_model: config.openai.model,
      ai_max_tokens: config.ai.maxTokens,
      ai_cache_enabled: config.ai.cacheEnabled,
      node_env: config.nodeEnv,
      supabase_connected: true,
      whatsapp_mode: config.isVercel ? 'cloud_api' : 'baileys',
    },
  });
}

export async function getPrompts(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await listPromptTemplates();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function getPrompt(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await getPromptTemplate(req.params.key as string);
    if (!data) {
      res.status(404).json({ success: false, error: 'Prompt bulunamadı' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function createPrompt(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await createPromptTemplate(req.body);
    await logActivity({
      userId: req.userId,
      action: 'prompt_created',
      entityType: 'ai_prompt',
      entityId: data.id,
      metadata: { prompt_key: data.prompt_key, name: data.name },
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function updatePrompt(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await updatePromptTemplate(req.params.key as string, req.body);
    await logActivity({
      userId: req.userId,
      action: 'prompt_updated',
      entityType: 'ai_prompt',
      entityId: data.id,
      metadata: { prompt_key: data.prompt_key, version: data.version },
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function resetPrompt(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await resetPromptToDefault(req.params.key as string);
    await logActivity({
      userId: req.userId,
      action: 'prompt_reset',
      entityType: 'ai_prompt',
      entityId: data.id,
      metadata: { prompt_key: data.prompt_key },
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function resetAllPrompts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await resetAllPromptsToDefault();
    await logActivity({
      userId: req.userId,
      action: 'prompts_reset_all',
      entityType: 'ai_prompt',
      metadata: result,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function cleanupPrompts(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await cleanupAndReseedPrompts();
    await logActivity({
      userId: req.userId,
      action: 'prompts_cleanup',
      entityType: 'ai_prompt',
      metadata: result,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function deletePrompt(req: AuthRequest, res: Response): Promise<void> {
  try {
    const key = req.params.key as string;
    await deletePromptTemplate(key);
    await logActivity({
      userId: req.userId,
      action: 'prompt_deleted',
      entityType: 'ai_prompt',
      metadata: { prompt_key: key },
    });
    res.json({ success: true, data: { prompt_key: key } });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function getPromptRoles(_req: AuthRequest, res: Response): Promise<void> {
  res.json({
    success: true,
    data: {
      roles: CORE_PROMPT_ROLES,
      meta: PROMPT_ROLE_META,
    },
  });
}

export async function seedPrompts(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const count = await seedDefaultPrompts();
    res.json({ success: true, data: { inserted: count } });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function getSubscriptionPlans(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({
      success: true,
      data: demoPlans.map((p) => ({ ...p, is_active: true, created_at: new Date().toISOString() })),
    });
    return;
  }

  try {
    const data = await getAllSubscriptionPlans();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Paketler alınamadı' });
  }
}

export async function updateSubscriptionPlanAdmin(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.status(400).json({ success: false, error: 'Demo modda paket düzenlenemez' });
    return;
  }

  const {
    name,
    description,
    features,
    message_limit,
    user_limit,
    price_monthly,
    currency,
    is_active,
    sync_subscriptions,
  } = req.body;

  try {
    const data = await updateSubscriptionPlan(String(req.params.id), {
      name,
      description,
      features: Array.isArray(features) ? features : undefined,
      message_limit: message_limit !== undefined ? Number(message_limit) : undefined,
      user_limit: user_limit !== undefined ? Number(user_limit) : undefined,
      price_monthly: price_monthly !== undefined ? Number(price_monthly) : undefined,
      currency: typeof currency === 'string' ? currency : undefined,
      is_active,
      sync_subscriptions: !!sync_subscriptions,
    });

    await logActivity({
      userId: req.userId,
      action: 'subscription_plan_updated',
      entityType: 'subscription_plan',
      entityId: data.id,
      metadata: { plan_type: data.plan_type, sync_subscriptions: !!sync_subscriptions },
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Paket güncellenemedi' });
  }
}
