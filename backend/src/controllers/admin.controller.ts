/**
 * Admin controller — platform yönetimi
 */

import { Response } from 'express';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { demoCompany, demoPlans, demoAiConversationAddons } from '../demo/mockData';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
import { logActivity } from '../services/log.service';
import {
  getExtendedPlatformStats,
  getCompaniesWithUsage,
  getCompanyDetail,
  updateCompanyAdmin,
  updateSubscriptionAdmin,
  createCompanyAdminUser,
  createSuperAdminUser,
  getPlatformAIUsage,
  getActivityLogs,
  getAdminActionCenter,
  getWhatsAppHealthMonitor,
  listCompanyAdminNotes,
  createCompanyAdminNote,
  deleteCompanyAdminNote,
  listSuperAdmins,
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
import {
  getAllAiConversationAddons,
  updateAiConversationAddon,
} from '../services/ai-addon.service';
import {
  createCompanyInvoicePdf,
  type BillingPeriod,
  type InvoiceOptions,
} from '../services/invoice.service';
import {
  getInvoiceIssuerSettings,
  updateInvoiceIssuerSettings,
} from '../services/invoice-settings.service';
import { buildContentDisposition } from '../utils/content-disposition';
import { listPlatformUsers, resetUserPasswordByProfileId } from '../services/password.service';

export async function getCompanies(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({
      success: true,
      data: [{ ...demoCompany, conversation_count: 0, ai_tokens_month: 0 }],
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

export async function startCompanyImpersonation(req: AuthRequest, res: Response): Promise<void> {
  const companyId = req.params.id as string;

  if (isDemoSession(req)) {
    res.json({
      success: true,
      data: { company_id: demoCompany.id, company_name: demoCompany.company_name },
    });
    return;
  }

  const { data: company, error } = await adminClient
    .from('companies')
    .select('id, company_name')
    .eq('id', companyId)
    .single();

  if (error || !company) {
    res.status(404).json({ success: false, error: 'Şirket bulunamadı' });
    return;
  }

  await logActivity({
    userId: req.userId,
    action: 'company_impersonation_started',
    entityType: 'company',
    entityId: company.id,
    metadata: { company_name: company.company_name },
  });

  res.json({
    success: true,
    data: { company_id: company.id, company_name: company.company_name },
  });
}

export async function downloadCompanyInvoice(req: AuthRequest, res: Response): Promise<void> {
  const companyId = req.params.id as string;
  const period = (req.query.period as string) === 'yearly' ? 'yearly' : 'monthly';
  const setupFeeRaw = req.query.setupFee as string | undefined;
  const setupFee = setupFeeRaw ? Math.max(0, Number(setupFeeRaw)) : 0;
  const setupFeeDescription = (req.query.setupFeeDescription as string) || undefined;

  if (isDemoSession(req)) {
    res.status(400).json({ success: false, error: 'Demo modda fatura oluşturulamaz' });
    return;
  }

  if (setupFeeRaw && Number.isNaN(Number(setupFeeRaw))) {
    res.status(400).json({ success: false, error: 'Geçersiz kurulum ücreti' });
    return;
  }

  try {
    const options: InvoiceOptions = {
      billingPeriod: period as BillingPeriod,
      setupFee: setupFee > 0 ? setupFee : undefined,
      setupFeeDescription,
    };
    const { buffer, filename } = await createCompanyInvoicePdf(companyId, options);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', buildContentDisposition(filename));
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Fatura oluşturulamadı',
    });
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
    .select('id, message_limit, user_limit')
    .eq('plan_type', plan)
    .single();

  if (planRow) {
    await adminClient.from('subscriptions').insert({
      company_id: company.id,
      plan_id: planRow.id,
      messages_limit: planRow.message_limit ?? limits.messages,
      users_limit: planRow.user_limit ?? limits.users,
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

export async function getActionCenter(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({
      success: true,
      data: {
        total: 3,
        critical_count: 1,
        warning_count: 2,
        items: [
          {
            id: 'quota_high-demo',
            type: 'quota_high',
            category: 'quota',
            severity: 'warning',
            company_id: demoCompany.id,
            company_name: demoCompany.company_name,
            meta: { quota_percent: 92, messages_used: 4600, messages_limit: 5000 },
          },
          {
            id: 'whatsapp_disconnected-demo',
            type: 'whatsapp_disconnected',
            category: 'whatsapp',
            severity: 'critical',
            company_id: demoCompany.id,
            company_name: demoCompany.company_name,
            meta: {},
          },
          {
            id: 'trial_ending-demo',
            type: 'trial_ending',
            category: 'trial',
            severity: 'warning',
            company_id: '00000000-0000-0000-0000-000000000099',
            company_name: 'Demo Otel',
            meta: { days_left: 5, trial_end: new Date(Date.now() + 5 * 86400000).toISOString() },
          },
        ],
      },
    });
    return;
  }

  try {
    const data = await getAdminActionCenter();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function getWhatsAppHealth(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    const now = new Date().toISOString();
    res.json({
      success: true,
      data: {
        summary: {
          total_accounts: 3,
          connected: 1,
          disconnected: 1,
          qr_pending: 1,
          reconnecting: 0,
          error: 0,
          issues: 2,
        },
        accounts: [
          {
            account_id: 'demo-wa-1',
            company_id: demoCompany.id,
            company_name: demoCompany.company_name,
            company_status: 'active',
            label: 'Ana Hat',
            phone_number: '+905551234567',
            db_status: 'connected',
            health_status: 'connected',
            connection_type: 'qr',
            is_default: true,
            is_active: true,
            last_synced_at: now,
            last_message_at: now,
            updated_at: now,
            live_connected: true,
          },
          {
            account_id: 'demo-wa-2',
            company_id: '00000000-0000-0000-0000-000000000099',
            company_name: 'Demo Otel',
            company_status: 'trial',
            label: null,
            phone_number: null,
            db_status: 'disconnected',
            health_status: 'disconnected',
            connection_type: 'none',
            is_default: true,
            is_active: true,
            last_synced_at: null,
            last_message_at: null,
            updated_at: now,
            live_connected: null,
          },
          {
            account_id: 'demo-wa-3',
            company_id: '00000000-0000-0000-0000-000000000098',
            company_name: 'Demo Emlak',
            company_status: 'active',
            label: 'Satış',
            phone_number: null,
            db_status: 'pending',
            health_status: 'qr_pending',
            connection_type: 'qr',
            is_default: true,
            is_active: true,
            last_synced_at: null,
            last_message_at: null,
            updated_at: now,
            live_connected: false,
          },
        ],
        checked_at: now,
      },
    });
    return;
  }

  const status = (req.query.status as string) || 'all';
  const search = (req.query.search as string) || '';

  try {
    const data = await getWhatsAppHealthMonitor({ status, search });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function getCompanyNotes(req: AuthRequest, res: Response): Promise<void> {
  const companyId = req.params.id as string;

  if (isDemoSession(req)) {
    res.json({
      success: true,
      data: [
        {
          id: 'demo-note-1',
          company_id: demoCompany.id,
          content: 'Kurulum 15 Mart 2026 tarihinde tamamlandı.',
          author_profile_id: null,
          author_name: 'Demo Admin',
          created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
        },
        {
          id: 'demo-note-2',
          company_id: demoCompany.id,
          content: 'Özel fiyat anlaşması var — aylık paket ücreti indirimli.',
          author_profile_id: null,
          author_name: 'Demo Admin',
          created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
        },
      ],
    });
    return;
  }

  try {
    const data = await listCompanyAdminNotes(companyId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function createCompanyNote(req: AuthRequest, res: Response): Promise<void> {
  const companyId = req.params.id as string;
  const { content } = req.body;

  if (!content?.trim()) {
    res.status(400).json({ success: false, error: 'Not içeriği gerekli' });
    return;
  }

  if (isDemoSession(req)) {
    res.status(400).json({ success: false, error: 'Demo modda not eklenemez' });
    return;
  }

  try {
    const data = await createCompanyAdminNote(companyId, content, {
      profileId: req.profile?.id,
      name: req.profile?.full_name,
    });

    await logActivity({
      userId: req.userId,
      companyId,
      action: 'company_admin_note_created',
      entityType: 'company_admin_note',
      entityId: data.id,
    });

    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function deleteCompanyNote(req: AuthRequest, res: Response): Promise<void> {
  const companyId = req.params.id as string;
  const noteId = req.params.noteId as string;

  if (isDemoSession(req)) {
    res.status(400).json({ success: false, error: 'Demo modda not silinemez' });
    return;
  }

  try {
    await deleteCompanyAdminNote(companyId, noteId);

    await logActivity({
      userId: req.userId,
      companyId,
      action: 'company_admin_note_deleted',
      entityType: 'company_admin_note',
      entityId: noteId,
    });

    res.json({ success: true, data: { id: noteId } });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
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

export async function getInvoiceSettings(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await getInvoiceIssuerSettings();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Fatura ayarları alınamadı',
    });
  }
}

export async function updateInvoiceSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await updateInvoiceIssuerSettings(req.body, req.userId);
    await logActivity({
      userId: req.userId,
      action: 'invoice_settings_updated',
      entityType: 'platform_invoice_settings',
      entityId: 'default',
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Fatura ayarları kaydedilemedi',
    });
  }
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
    price_yearly,
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
      price_yearly:
        price_yearly === null || price_yearly === ''
          ? null
          : price_yearly !== undefined
            ? Number(price_yearly)
            : undefined,
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

export async function getAiConversationAddonsAdmin(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({ success: true, data: demoAiConversationAddons });
    return;
  }

  try {
    const data = await getAllAiConversationAddons();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Ek paketler alınamadı' });
  }
}

export async function updateAiConversationAddonAdmin(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.status(400).json({ success: false, error: 'Demo modda ek paket düzenlenemez' });
    return;
  }

  const { name, conversation_count, price, currency, is_active, sort_order } = req.body;

  try {
    const data = await updateAiConversationAddon(String(req.params.id), {
      name,
      conversation_count: conversation_count !== undefined ? Number(conversation_count) : undefined,
      price: price !== undefined ? Number(price) : undefined,
      currency: typeof currency === 'string' ? currency : undefined,
      is_active,
      sort_order: sort_order !== undefined ? Number(sort_order) : undefined,
    });

    await logActivity({
      userId: req.userId,
      action: 'ai_addon_updated',
      entityType: 'ai_conversation_addon',
      entityId: data.id,
      metadata: { name: data.name },
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Ek paket güncellenemedi' });
  }
}

export async function getAdminUsers(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({
      success: true,
      data: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });
    return;
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const search = (req.query.search as string) || '';

  try {
    const result = await listPlatformUsers(page, limit, search);
    res.json({ success: true, data: result.users, pagination: result.pagination });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function getSuperAdmins(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({
      success: true,
      data: [
        {
          id: 'demo-admin',
          user_id: 'demo-admin-user',
          full_name: 'Demo Admin',
          email: 'admin@demo.com',
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ],
    });
    return;
  }

  try {
    const data = await listSuperAdmins();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function createSuperAdmin(req: AuthRequest, res: Response): Promise<void> {
  const { email, password, full_name } = req.body;

  if (!email?.trim() || !password || !full_name?.trim()) {
    res.status(400).json({ success: false, error: 'E-posta, şifre ve ad soyad zorunludur' });
    return;
  }

  if (isDemoSession(req)) {
    res.status(400).json({ success: false, error: 'Demo modda yeni yönetici oluşturulamaz' });
    return;
  }

  try {
    const result = await createSuperAdminUser(email, password, full_name);

    await logActivity({
      userId: req.userId,
      action: 'super_admin_created',
      entityType: 'profile',
      entityId: result.profileId,
      metadata: { email: email.trim().toLowerCase() },
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function resetUserPassword(req: AuthRequest, res: Response): Promise<void> {
  const { password } = req.body;

  if (!password) {
    res.status(400).json({ success: false, error: 'Yeni şifre zorunludur' });
    return;
  }

  if (isDemoSession(req)) {
    res.status(400).json({ success: false, error: 'Demo modda şifre değiştirilemez' });
    return;
  }

  try {
    const result = await resetUserPasswordByProfileId(String(req.params.profileId), password);

    await logActivity({
      userId: req.userId,
      action: 'user_password_reset',
      entityType: 'profile',
      entityId: result.profileId,
      metadata: { email: result.email },
    });

    res.json({ success: true, message: 'Kullanıcı şifresi güncellendi' });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}
