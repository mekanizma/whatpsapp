/**
 * Platform admin service — şirket, kullanım ve AI istatistikleri
 */

import { adminClient } from '../database/supabase';
import { config } from '../config';
import { getDashboardStats } from './dashboard.service';
import { getMonthStartISO } from '../utils/date';
import { getPlatformConversationCount, getConversationCountsByCompany } from './conversation-count.service';
import { mapSubscriptionToCompanyPlan } from './plan-capabilities.service';
import { enrichProfilesWithEmail } from './password.service';

const PLAN_LIMITS: Record<string, { messages: number; users: number }> = {
  starter: { messages: 1000, users: 1 },
  business: { messages: 5000, users: 5 },
  enterprise: { messages: 999999, users: 999 },
};

export async function getExtendedPlatformStats() {
  const monthStart = getMonthStartISO();

  const [companies, totalConversations, subs, aiLogs, tickets, waConnected] = await Promise.all([
    adminClient.from('companies').select('id', { count: 'exact', head: true }),
    getPlatformConversationCount(),
    adminClient.from('subscriptions').select('messages_used, messages_limit, status'),
    adminClient
      .from('ai_usage_logs')
      .select('total_tokens, cached, skipped')
      .gte('created_at', monthStart),
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
  const aiMessageFallback = await adminClient
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_type', 'ai')
    .gte('created_at', monthStart);

  const apiCallsFromLogs = ai.filter((l) => !l.skipped && !l.cached).length;
  const apiCallsFromMessages = aiMessageFallback.count || 0;

  return {
    total_companies: companies.count || 0,
    total_conversations: totalConversations,
    total_messages_used: allSubs.reduce((s, x) => s + (x.messages_used || 0), 0),
    active_subscriptions: allSubs.filter((s) => s.status === 'active' || s.status === 'trial').length,
    open_tickets: tickets.count || 0,
    whatsapp_connected: waConnected.count || 0,
    ai_tokens_month: ai.reduce((s, l) => s + (l.total_tokens || 0), 0),
    ai_api_calls_month: Math.max(apiCallsFromLogs, apiCallsFromMessages),
    ai_saved_month: ai.filter((l) => l.skipped || l.cached).length,
    ai_model: config.openai.model,
  };
}

export async function getCompaniesWithUsage(page = 1, limit = 50, search = '') {
  const offset = (page - 1) * limit;
  let query = adminClient
    .from('companies')
    .select(
      `*, subscriptions(messages_used, messages_limit, status, users_limit, plan:plan_id(plan_type, name, description, features, message_limit, user_limit)),
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

  let conversationCounts: Record<string, number> = {};
  let aiTokens: Record<string, number> = {};

  if (ids.length) {
    const monthStart = getMonthStartISO();
    const [convCounts, ai] = await Promise.all([
      getConversationCountsByCompany(ids),
      adminClient
        .from('ai_usage_logs')
        .select('company_id, total_tokens')
        .in('company_id', ids)
        .gte('created_at', monthStart),
    ]);

    for (const a of ai.data || []) {
      aiTokens[a.company_id] = (aiTokens[a.company_id] || 0) + (a.total_tokens || 0);
    }
    conversationCounts = convCounts;
  }

  return {
    companies: companies.map((c) => {
      const subscription = Array.isArray(c.subscriptions) ? c.subscriptions[0] : c.subscriptions;
      const plan = mapSubscriptionToCompanyPlan(
        subscription as Record<string, unknown> | undefined
      );

      return {
        ...c,
        conversation_count: conversationCounts[c.id] || 0,
        ai_tokens_month: aiTokens[c.id] || 0,
        subscription: subscription
          ? {
              messages_used: subscription.messages_used,
              messages_limit: subscription.messages_limit,
              status: subscription.status,
              users_limit: subscription.users_limit,
            }
          : undefined,
        plan,
        whatsapp: Array.isArray(c.whatsapp_configs) ? c.whatsapp_configs[0] : c.whatsapp_configs,
      };
    }),
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
    adminClient
      .from('subscriptions')
      .select(
        '*, subscription_plans(plan_type, name, description, features, message_limit, user_limit, price_monthly, price_yearly, currency)'
      )
      .eq('company_id', companyId)
      .single(),
    adminClient.from('whatsapp_configs').select('status, phone_number, business_account_id').eq('company_id', companyId).single(),
    adminClient
      .from('profiles')
      .select('id, user_id, full_name, role, is_active, created_at')
      .eq('company_id', companyId),
    adminClient.from('staff').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    getDashboardStats(companyId),
  ]);

  const subscriptionRow = subscription.data
    ? {
        ...subscription.data,
        plan: Array.isArray(subscription.data.subscription_plans)
          ? subscription.data.subscription_plans[0]
          : subscription.data.subscription_plans,
      }
    : null;

  const usersWithEmail = await enrichProfilesWithEmail(profiles.data || []);

  return {
    company,
    subscription: subscriptionRow,
    plan: mapSubscriptionToCompanyPlan(subscription.data as Record<string, unknown> | undefined),
    whatsapp: whatsapp.data,
    users: usersWithEmail,
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
    } else {
      subUpdates.messages_limit = limits.messages;
      subUpdates.users_limit = limits.users;
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
  const monthStart = getMonthStartISO();

  const [logsResult, companiesResult, aiMessagesResult] = await Promise.all([
    adminClient
      .from('ai_usage_logs')
      .select('company_id, total_tokens, cached, skipped, created_at')
      .gte('created_at', monthStart),
    adminClient.from('companies').select('id, company_name'),
    adminClient
      .from('messages')
      .select('company_id')
      .eq('sender_type', 'ai')
      .gte('created_at', monthStart),
  ]);

  if (logsResult.error) {
    console.error('[AI Usage] Log sorgusu başarısız:', logsResult.error.message);
  }
  if (aiMessagesResult.error) {
    console.error('[AI Usage] Mesaj sorgusu başarısız:', aiMessagesResult.error.message);
  }

  const logs = logsResult.data || [];
  const companies = companiesResult.data || [];

  const byCompany: Record<string, { tokens: number; api_calls: number; saved: number }> = {};
  for (const log of logs) {
    if (!log.company_id) continue;
    if (!byCompany[log.company_id]) {
      byCompany[log.company_id] = { tokens: 0, api_calls: 0, saved: 0 };
    }
    byCompany[log.company_id].tokens += log.total_tokens || 0;
    if (log.cached || log.skipped) byCompany[log.company_id].saved += 1;
    else byCompany[log.company_id].api_calls += 1;
  }

  const aiMsgCounts: Record<string, number> = {};
  for (const msg of aiMessagesResult.data || []) {
    if (!msg.company_id) continue;
    aiMsgCounts[msg.company_id] = (aiMsgCounts[msg.company_id] || 0) + 1;
  }

  return companies
    .map((c) => {
      const fromLogs = byCompany[c.id] || { tokens: 0, api_calls: 0, saved: 0 };
      const messageCalls = aiMsgCounts[c.id] || 0;
      return {
        company_id: c.id,
        company_name: c.company_name,
        tokens: fromLogs.tokens,
        api_calls: Math.max(fromLogs.api_calls, messageCalls),
        saved: fromLogs.saved,
      };
    })
    .sort((a, b) => b.api_calls - a.api_calls || b.tokens - a.tokens);
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
