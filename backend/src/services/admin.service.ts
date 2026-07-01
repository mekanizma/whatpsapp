/**
 * Platform admin service — şirket, kullanım ve AI istatistikleri
 */

import { adminClient } from '../database/supabase';
import { config } from '../config';
import { getDashboardStats } from './dashboard.service';

const PLAN_LIMITS: Record<string, { messages: number; users: number }> = {
  starter: { messages: 1000, users: 1 },
  business: { messages: 5000, users: 5 },
  enterprise: { messages: 999999, users: 999 },
};

export async function getExtendedPlatformStats() {
  const monthStart = new Date(new Date().setDate(1));
  monthStart.setHours(0, 0, 0, 0);

  const [companies, messages, subs, aiLogs, tickets, waConnected] = await Promise.all([
    adminClient.from('companies').select('id', { count: 'exact', head: true }),
    adminClient.from('messages').select('id', { count: 'exact', head: true }),
    adminClient.from('subscriptions').select('messages_used, messages_limit, status'),
    adminClient
      .from('ai_usage_logs')
      .select('total_tokens, cached, skipped')
      .gte('created_at', monthStart.toISOString()),
    adminClient
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress']),
    adminClient
      .from('whatsapp_configs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'connected'),
  ]);

  const allSubs = subs.data || [];
  const ai = aiLogs.data || [];

  return {
    total_companies: companies.count || 0,
    total_messages: messages.count || 0,
    total_messages_used: allSubs.reduce((s, x) => s + (x.messages_used || 0), 0),
    active_subscriptions: allSubs.filter((s) => s.status === 'active' || s.status === 'trial').length,
    open_tickets: tickets.count || 0,
    whatsapp_connected: waConnected.count || 0,
    ai_tokens_month: ai.reduce((s, l) => s + (l.total_tokens || 0), 0),
    ai_api_calls_month: ai.filter((l) => !l.skipped && !l.cached).length,
    ai_saved_month: ai.filter((l) => l.skipped || l.cached).length,
    ai_model: config.openai.model,
  };
}

export async function getCompaniesWithUsage(page = 1, limit = 50, search = '') {
  const offset = (page - 1) * limit;
  let query = adminClient
    .from('companies')
    .select(
      `*, subscriptions(messages_used, messages_limit, status, users_limit),
       whatsapp_configs(status, phone_number)`,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  if (search.trim()) {
    query = query.or(`company_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, count, error } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  const companies = data || [];
  const ids = companies.map((c) => c.id);

  let msgCounts: Record<string, number> = {};
  let aiTokens: Record<string, number> = {};

  if (ids.length) {
    const monthStart = new Date(new Date().setDate(1)).toISOString();
    const [msgs, ai] = await Promise.all([
      adminClient.from('messages').select('company_id').in('company_id', ids),
      adminClient
        .from('ai_usage_logs')
        .select('company_id, total_tokens')
        .in('company_id', ids)
        .gte('created_at', monthStart),
    ]);

    for (const m of msgs.data || []) {
      msgCounts[m.company_id] = (msgCounts[m.company_id] || 0) + 1;
    }
    for (const a of ai.data || []) {
      aiTokens[a.company_id] = (aiTokens[a.company_id] || 0) + (a.total_tokens || 0);
    }
  }

  return {
    companies: companies.map((c) => ({
      ...c,
      message_count: msgCounts[c.id] || 0,
      ai_tokens_month: aiTokens[c.id] || 0,
      subscription: Array.isArray(c.subscriptions) ? c.subscriptions[0] : c.subscriptions,
      whatsapp: Array.isArray(c.whatsapp_configs) ? c.whatsapp_configs[0] : c.whatsapp_configs,
    })),
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
  };
}

export async function getCompanyDetail(companyId: string) {
  const { data: company, error } = await adminClient
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  if (error || !company) throw new Error('Şirket bulunamadı');

  const [subscription, whatsapp, profiles, staffCount, stats] = await Promise.all([
    adminClient.from('subscriptions').select('*, subscription_plans(plan_type, name)').eq('company_id', companyId).single(),
    adminClient.from('whatsapp_configs').select('status, phone_number, business_account_id').eq('company_id', companyId).single(),
    adminClient.from('profiles').select('id, full_name, role, is_active, created_at').eq('company_id', companyId),
    adminClient.from('staff').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    getDashboardStats(companyId),
  ]);

  return {
    company,
    subscription: subscription.data
      ? {
          ...subscription.data,
          plan: Array.isArray(subscription.data.subscription_plans)
            ? subscription.data.subscription_plans[0]
            : subscription.data.subscription_plans,
        }
      : null,
    whatsapp: whatsapp.data,
    users: profiles.data || [],
    staff_count: staffCount.count || 0,
    stats,
  };
}

export async function updateCompanyAdmin(
  companyId: string,
  updates: {
    company_name?: string;
    category?: string;
    phone?: string;
    email?: string;
    address?: string;
    subscription_plan?: string;
    status?: string;
  }
) {
  const { data, error } = await adminClient
    .from('companies')
    .update(updates)
    .eq('id', companyId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateSubscriptionAdmin(
  companyId: string,
  updates: {
    messages_limit?: number;
    messages_used?: number;
    status?: string;
    plan_type?: string;
  }
) {
  const subUpdates: Record<string, unknown> = {};
  if (updates.messages_limit !== undefined) subUpdates.messages_limit = updates.messages_limit;
  if (updates.messages_used !== undefined) subUpdates.messages_used = updates.messages_used;
  if (updates.status) subUpdates.status = updates.status;

  if (updates.plan_type) {
    const limits = PLAN_LIMITS[updates.plan_type] || PLAN_LIMITS.starter;
    const { data: plan } = await adminClient
      .from('subscription_plans')
      .select('id, message_limit, user_limit')
      .eq('plan_type', updates.plan_type)
      .single();

    if (plan) {
      subUpdates.plan_id = plan.id;
      subUpdates.messages_limit = plan.message_limit ?? limits.messages;
      subUpdates.users_limit = plan.user_limit ?? limits.users;
    }

    await adminClient
      .from('companies')
      .update({ subscription_plan: updates.plan_type })
      .eq('id', companyId);
  }

  const { data, error } = await adminClient
    .from('subscriptions')
    .update(subUpdates)
    .eq('company_id', companyId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createCompanyAdminUser(
  companyId: string,
  email: string,
  password: string,
  fullName: string
): Promise<string> {
  const { data: existing } = await adminClient.auth.admin.listUsers();
  const found = existing?.users?.find((u) => u.email === email);

  let userId: string;
  if (found) {
    userId = found.id;
  } else {
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: 'company_admin' },
    });
    if (error) throw new Error(error.message);
    userId = data.user.id;
  }

  const { error: profileError } = await adminClient.from('profiles').upsert(
    {
      user_id: userId,
      company_id: companyId,
      full_name: fullName,
      role: 'company_admin',
      is_active: true,
    },
    { onConflict: 'user_id' }
  );

  if (profileError) throw new Error(profileError.message);
  return userId;
}

export async function getPlatformAIUsage() {
  const monthStart = new Date(new Date().setDate(1)).toISOString();

  const { data: logs } = await adminClient
    .from('ai_usage_logs')
    .select('company_id, total_tokens, cached, skipped, created_at')
    .gte('created_at', monthStart);

  const { data: companies } = await adminClient.from('companies').select('id, company_name');

  const byCompany: Record<string, { tokens: number; api_calls: number; saved: number }> = {};
  for (const log of logs || []) {
    if (!byCompany[log.company_id]) {
      byCompany[log.company_id] = { tokens: 0, api_calls: 0, saved: 0 };
    }
    byCompany[log.company_id].tokens += log.total_tokens || 0;
    if (log.cached || log.skipped) byCompany[log.company_id].saved += 1;
    else byCompany[log.company_id].api_calls += 1;
  }

  return (companies || []).map((c) => ({
    company_id: c.id,
    company_name: c.company_name,
    ...(byCompany[c.id] || { tokens: 0, api_calls: 0, saved: 0 }),
  }));
}

export async function getActivityLogs(page = 1, limit = 30, companyId?: string) {
  const offset = (page - 1) * limit;
  let query = adminClient
    .from('activity_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (companyId) query = query.eq('company_id', companyId);

  const { data, count, error } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  return {
    logs: data || [],
    pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
  };
}

export { PLAN_LIMITS };
