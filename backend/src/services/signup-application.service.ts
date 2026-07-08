/**
 * Kayıt başvuruları — herkese açık form + admin yönetimi + WhatsApp bildirimi
 */

import { config } from '../config';
import { adminClient } from '../database/supabase';
import { sendMessageToCustomer } from '../whatsapp/whatsapp.service';
import { normalizePhoneNumber } from '../whatsapp/message.handler';
import { createCompanySubscription, resolveSubscriptionPlan } from './company-subscription.service';

export type SignupApplicationStatus = 'pending' | 'reviewed' | 'approved' | 'rejected';

export type SignupBillingPeriod = 'monthly' | 'yearly';

export interface SignupApplicationPlan {
  id: string;
  plan_type: string;
  name: string;
  name_en?: string | null;
  price_monthly: number;
  price_yearly: number | null;
  currency: string;
}

export interface SignupApplication {
  id: string;
  company_name: string;
  category: string;
  full_name: string;
  phone: string | null;
  email: string;
  subscription_plan_id: string | null;
  billing_period: SignupBillingPeriod;
  provisioned_company_id?: string | null;
  status: SignupApplicationStatus;
  admin_notes: string | null;
  whatsapp_sent: boolean;
  created_at: string;
  updated_at: string;
  plan?: SignupApplicationPlan | null;
}

export interface CreateSignupApplicationInput {
  company_name: string;
  category: string;
  full_name: string;
  phone?: string;
  email: string;
  subscription_plan_id: string;
  billing_period?: SignupBillingPeriod;
}

const CATEGORY_LABELS: Record<string, string> = {
  restoran: 'Kafe & Restoran',
  otel: 'Otel & Konaklama',
  rent_a_car: 'Rent a Car',
  guzellik_merkezi: 'Güzellik Merkezi',
  klinik: 'Klinik & Sağlık',
  dis_hekimi: 'Diş Hekimi',
  emlak: 'Emlak',
  universite: 'Üniversite & Eğitim',
  kurs: 'Kurs & Dershane',
  diger: 'Diğer',
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category;
}

function billingPeriodLabel(period: SignupBillingPeriod): string {
  return period === 'yearly' ? 'Yıllık' : 'Aylık';
}

const SIGNUP_PLAN_SELECT =
  'id, plan_type, name, name_en, price_monthly, price_yearly, currency';

const SIGNUP_PLAN_SELECT_WITH_LIMITS =
  'id, plan_type, name, name_en, price_monthly, price_yearly, currency, message_limit, user_limit, is_active';

function normalizeSignupApplicationRow(row: Record<string, unknown>): SignupApplication {
  const planRaw = row.plan ?? row.subscription_plans;
  const plan = Array.isArray(planRaw) ? planRaw[0] : planRaw;
  const { subscription_plans: _subscriptionPlans, plan: _plan, ...rest } = row;
  return {
    ...(rest as unknown as SignupApplication),
    plan: (plan as SignupApplicationPlan | null | undefined) || null,
  };
}

function buildWhatsAppMessage(app: SignupApplication): string {
  const planName = app.plan?.name || '—';
  const billing = billingPeriodLabel(app.billing_period || 'monthly');
  const lines = [
    '📋 *Yeni Başvuru Formu*',
    '',
    `*İşletme:* ${app.company_name}`,
    `*Sektör:* ${categoryLabel(app.category)}`,
    `*Paket:* ${planName} (${billing})`,
    `*Ad Soyad:* ${app.full_name}`,
    `*Telefon:* ${app.phone || '-'}`,
    `*E-posta:* ${app.email}`,
    '',
    `Başvuru No: ${app.id.slice(0, 8).toUpperCase()}`,
    `Tarih: ${new Date(app.created_at).toLocaleString('tr-TR')}`,
  ];
  return lines.join('\n');
}

async function resolveSignupPlan(
  planId: string,
  billingPeriod: SignupBillingPeriod
): Promise<SignupApplicationPlan> {
  const { data, error } = await adminClient
    .from('subscription_plans')
    .select('id, plan_type, name, name_en, price_monthly, price_yearly, currency, is_active')
    .eq('id', planId)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    throw new Error('Geçersiz paket seçimi');
  }

  const yearlyPrice = data.price_yearly != null ? Number(data.price_yearly) : null;
  if (billingPeriod === 'yearly' && !(yearlyPrice && yearlyPrice > 0)) {
    throw new Error('Seçilen paket için yıllık fiyat tanımlı değil');
  }

  return {
    id: String(data.id),
    plan_type: String(data.plan_type),
    name: String(data.name),
    name_en: typeof data.name_en === 'string' ? data.name_en : null,
    price_monthly: Number(data.price_monthly) || 0,
    price_yearly: yearlyPrice,
    currency: String(data.currency || 'TRY'),
  };
}

async function resolvePlatformCompanyId(): Promise<string | null> {
  if (config.platform.companyId) return config.platform.companyId;

  const { data } = await adminClient
    .from('whatsapp_configs')
    .select('company_id')
    .eq('status', 'connected')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.company_id || null;
}

async function notifySignupViaWhatsApp(app: SignupApplication): Promise<boolean> {
  const companyId = await resolvePlatformCompanyId();
  if (!companyId) {
    console.warn('[SignupApplication] WhatsApp bildirimi atlandı — bağlı platform şirketi bulunamadı');
    return false;
  }

  const phones = config.platform.signupNotifyPhones;
  if (!phones.length) {
    console.warn('[SignupApplication] WhatsApp bildirimi atlandı — bildirim telefonu tanımlı değil');
    return false;
  }

  const message = buildWhatsAppMessage(app);
  let anySent = false;

  for (const rawPhone of phones) {
    const phone = normalizePhoneNumber(rawPhone) || rawPhone;
    const result = await sendMessageToCustomer(companyId, phone, message);
    if (result.success) {
      anySent = true;
      console.log(`[SignupApplication] WhatsApp bildirimi gönderildi → ${phone}`);
    } else {
      console.error(`[SignupApplication] WhatsApp bildirimi başarısız → ${phone}: ${result.error}`);
    }
  }

  return anySent;
}

export async function createSignupApplication(
  input: CreateSignupApplicationInput
): Promise<SignupApplication> {
  const companyName = input.company_name.trim();
  const fullName = input.full_name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.trim()
    ? normalizePhoneNumber(input.phone.trim()) || input.phone.trim()
    : null;
  const category = input.category?.trim() || 'diger';
  const planId = input.subscription_plan_id?.trim();
  if (!planId) throw new Error('Paket seçimi zorunludur');

  const billingPeriod: SignupBillingPeriod =
    input.billing_period === 'yearly' ? 'yearly' : 'monthly';
  const plan = await resolveSignupPlan(planId, billingPeriod);

  const { data, error } = await adminClient
    .from('signup_applications')
    .insert({
      company_name: companyName,
      category,
      full_name: fullName,
      phone,
      email,
      subscription_plan_id: plan.id,
      billing_period: billingPeriod,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  const app = { ...(data as SignupApplication), plan };
  const whatsappSent = await notifySignupViaWhatsApp(app);

  if (whatsappSent) {
    await adminClient
      .from('signup_applications')
      .update({ whatsapp_sent: true })
      .eq('id', app.id);
    app.whatsapp_sent = true;
  }

  return app;
}

export async function countPendingSignupApplications(): Promise<number> {
  const { count, error } = await adminClient
    .from('signup_applications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (error) throw new Error(error.message);
  return count || 0;
}

export async function listSignupApplicationsAdmin(options?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{
  applications: SignupApplication[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const page = options?.page || 1;
  const limit = options?.limit || 30;
  const offset = (page - 1) * limit;

  let query = adminClient
    .from('signup_applications')
    .select(`*, subscription_plans(${SIGNUP_PLAN_SELECT})`, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }

  if (options?.search?.trim()) {
    const term = options.search.trim();
    query = query.or(
      `company_name.ilike.%${term}%,full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`
    );
  }

  const { data, count, error } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  const total = count || 0;
  return {
    applications: (data || []).map((row) => normalizeSignupApplicationRow(row as Record<string, unknown>)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function updateSignupApplicationAdmin(
  id: string,
  payload: { status?: SignupApplicationStatus; admin_notes?: string | null }
): Promise<SignupApplication> {
  const update: Record<string, unknown> = {};
  if (payload.status) update.status = payload.status;
  if (payload.admin_notes !== undefined) update.admin_notes = payload.admin_notes?.trim() || null;

  if (!Object.keys(update).length) {
    throw new Error('Güncellenecek alan yok');
  }

  const { data, error } = await adminClient
    .from('signup_applications')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as SignupApplication;
}

export async function provisionCompanyFromSignupApplication(
  applicationId: string
): Promise<{ company_id: string; application: SignupApplication }> {
  const { data: appRow, error: appError } = await adminClient
    .from('signup_applications')
    .select(`*, subscription_plans(${SIGNUP_PLAN_SELECT_WITH_LIMITS})`)
    .eq('id', applicationId)
    .single();

  if (appError || !appRow) {
    throw new Error('Başvuru bulunamadı');
  }

  const normalizedApp = normalizeSignupApplicationRow(appRow as Record<string, unknown>);

  if (normalizedApp.provisioned_company_id) {
    throw new Error('Bu başvuru için zaten hesap oluşturulmuş');
  }

  const planId = normalizedApp.subscription_plan_id || normalizedApp.plan?.id;
  if (!planId) {
    throw new Error('Başvuruda geçerli bir paket seçimi yok');
  }

  const plan = await resolveSubscriptionPlan({
    plan_id: String(planId),
    require_active: true,
  });
  const billingPeriod = normalizedApp.billing_period === 'yearly' ? 'yearly' : 'monthly';

  const { data: company, error: companyError } = await adminClient
    .from('companies')
    .insert({
      company_name: normalizedApp.company_name,
      category: normalizedApp.category || 'diger',
      phone: normalizedApp.phone,
      email: normalizedApp.email,
      subscription_plan: plan.plan_type,
      status: 'trial',
    })
    .select()
    .single();

  if (companyError || !company) {
    throw new Error(companyError?.message || 'Şirket oluşturulamadı');
  }

  try {
    await createCompanySubscription({
      companyId: company.id,
      plan,
      billingPeriod,
      status: 'trial',
    });
  } catch (subErr) {
    await adminClient.from('companies').delete().eq('id', company.id);
    throw subErr;
  }

  await adminClient.from('whatsapp_configs').insert({ company_id: company.id });

  const { data: updatedApp, error: updateError } = await adminClient
    .from('signup_applications')
    .update({
      status: 'approved',
      provisioned_company_id: company.id,
    })
    .eq('id', applicationId)
    .select(`*, subscription_plans(${SIGNUP_PLAN_SELECT})`)
    .single();

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    company_id: company.id,
    application: normalizeSignupApplicationRow(updatedApp as Record<string, unknown>),
  };
}
