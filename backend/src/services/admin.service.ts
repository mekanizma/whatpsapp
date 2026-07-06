/**
 * Platform admin service — şirket, kullanım ve AI istatistikleri
 */

import { adminClient } from '../database/supabase';
import { config } from '../config';
import {
  getBaileysConnectionStatus,
  isBaileysReconnecting,
} from '../whatsapp/baileys.manager';
import { getDashboardStats } from './dashboard.service';
import { getMonthStartISO } from '../utils/date';
import { getPlatformConversationCount, getConversationCountsByCompany } from './conversation-count.service';
import { mapSubscriptionToCompanyPlan } from './plan-capabilities.service';
import { countOpenPlatformSupportTickets } from './platform-support.service';
import { enrichProfilesWithEmail } from './password.service';

const PLAN_LIMITS: Record<string, { messages: number; users: number }> = {
  starter: { messages: 1000, users: 1 },
  business: { messages: 5000, users: 5 },
  enterprise: { messages: 999999, users: 999 },
};

export async function getExtendedPlatformStats() {
  const monthStart = getMonthStartISO();

  const [companies, totalConversations, subs, aiLogs, tickets, waConnected, platformSupportOpen] = await Promise.all([
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
    countOpenPlatformSupportTickets(),
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
    platform_support_open: platformSupportOpen,
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

export interface SuperAdminUser {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
  created_at: string;
}

export async function listSuperAdmins(): Promise<SuperAdminUser[]> {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id, user_id, full_name, is_active, created_at')
    .eq('role', 'super_admin')
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  const enriched = await enrichProfilesWithEmail(data || []);
  return enriched.map((row) => ({
    id: row.id,
    user_id: row.user_id!,
    full_name: row.full_name,
    email: row.email,
    is_active: row.is_active,
    created_at: row.created_at,
  }));
}

export async function createSuperAdminUser(
  email: string,
  password: string,
  fullName: string
): Promise<{ userId: string; profileId: string }> {
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedName = fullName.trim();

  if (!trimmedEmail || !trimmedName) {
    throw new Error('E-posta ve ad soyad zorunludur');
  }
  if (!password || password.length < 6) {
    throw new Error('Şifre en az 6 karakter olmalıdır');
  }

  const { data: existing } = await adminClient.auth.admin.listUsers();
  const found = existing?.users?.find((u) => u.email?.toLowerCase() === trimmedEmail);

  if (found) {
    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, role')
      .eq('user_id', found.id)
      .maybeSingle();

    if (profile?.role === 'super_admin') {
      throw new Error('Bu e-posta ile zaten bir platform yöneticisi kayıtlı');
    }
    throw new Error('Bu e-posta adresi başka bir hesapta kullanılıyor');
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email: trimmedEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: trimmedName, role: 'super_admin' },
  });
  if (error) throw new Error(error.message);

  const userId = data.user.id;

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        full_name: trimmedName,
        role: 'super_admin',
        company_id: null,
        is_active: true,
      },
      { onConflict: 'user_id' }
    )
    .select('id')
    .single();

  if (profileError) throw new Error(profileError.message);
  return { userId, profileId: profile.id };
}

const DEFAULT_TRIAL_DAYS = 14;
const QUOTA_WARNING_PERCENT = 90;
const TRIAL_WARNING_DAYS = 7;
const INACTIVE_HOURS = 24;

export type ActionCenterCategory = 'quota' | 'whatsapp' | 'trial' | 'activity' | 'tickets';
export type ActionCenterSeverity = 'critical' | 'warning' | 'info';
export type ActionCenterItemType =
  | 'quota_exhausted'
  | 'quota_high'
  | 'whatsapp_disconnected'
  | 'trial_expired'
  | 'trial_ending'
  | 'inactive_messaging'
  | 'open_ticket';

export interface ActionCenterItem {
  id: string;
  type: ActionCenterItemType;
  category: ActionCenterCategory;
  severity: ActionCenterSeverity;
  company_id: string;
  company_name: string;
  meta: {
    quota_percent?: number;
    messages_used?: number;
    messages_limit?: number;
    days_left?: number;
    trial_end?: string;
    ticket_id?: string;
    ticket_subject?: string;
    ticket_priority?: string;
    hours_inactive?: number;
  };
}

export interface ActionCenterData {
  total: number;
  critical_count: number;
  warning_count: number;
  items: ActionCenterItem[];
}

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function resolveTrialEnd(
  companyCreatedAt: string,
  sub: { ends_at?: string | null; starts_at?: string | null }
): Date {
  if (sub.ends_at) return new Date(sub.ends_at);
  const start = sub.starts_at ? new Date(sub.starts_at) : new Date(companyCreatedAt);
  return new Date(start.getTime() + DEFAULT_TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

function severityRank(severity: ActionCenterSeverity): number {
  if (severity === 'critical') return 0;
  if (severity === 'warning') return 1;
  return 2;
}

export async function getAdminActionCenter(): Promise<ActionCenterData> {
  const dayAgo = new Date(Date.now() - INACTIVE_HOURS * 60 * 60 * 1000).toISOString();

  const { data: companies, error: companiesError } = await adminClient
    .from('companies')
    .select('id, company_name, status, created_at');

  if (companiesError) throw new Error(companiesError.message);

  const allCompanies = companies || [];
  const activeCompanies = allCompanies.filter((c) => c.status === 'active' || c.status === 'trial');
  const companyIds = activeCompanies.map((c) => c.id);
  const companyMap = new Map(allCompanies.map((c) => [c.id, c]));

  if (companyIds.length === 0) {
    const ticketsOnly = await adminClient
      .from('tickets')
      .select('id, company_id, subject, priority, status, created_at')
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(30);

    if (ticketsOnly.error) throw new Error(ticketsOnly.error.message);

    const ticketItems: ActionCenterItem[] = (ticketsOnly.data || [])
      .map((ticket) => {
        const company = companyMap.get(ticket.company_id);
        if (!company) return null;
        return {
          id: `open_ticket-${ticket.id}`,
          type: 'open_ticket' as const,
          category: 'tickets' as const,
          severity:
            ticket.priority === 'high' || ticket.priority === 'urgent'
              ? ('critical' as const)
              : ('warning' as const),
          company_id: ticket.company_id,
          company_name: company.company_name,
          meta: {
            ticket_id: ticket.id,
            ticket_subject: ticket.subject,
            ticket_priority: ticket.priority,
          },
        };
      })
      .filter(Boolean) as ActionCenterItem[];

    return {
      total: ticketItems.length,
      critical_count: ticketItems.filter((i) => i.severity === 'critical').length,
      warning_count: ticketItems.filter((i) => i.severity === 'warning').length,
      items: ticketItems,
    };
  }

  const [subsRes, waRes, recentMsgRes, ticketsRes] = await Promise.all([
    adminClient
      .from('subscriptions')
      .select('company_id, messages_used, messages_limit, status, ends_at, starts_at')
      .in('company_id', companyIds),
    adminClient
      .from('whatsapp_configs')
      .select('company_id, status, is_default')
      .in('company_id', companyIds),
    adminClient
      .from('messages')
      .select('company_id')
      .gte('created_at', dayAgo)
      .in('company_id', companyIds),
    adminClient
      .from('tickets')
      .select('id, company_id, subject, priority, status, created_at')
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  if (subsRes.error) throw new Error(subsRes.error.message);
  if (waRes.error) throw new Error(waRes.error.message);
  if (recentMsgRes.error) throw new Error(recentMsgRes.error.message);
  if (ticketsRes.error) throw new Error(ticketsRes.error.message);

  const subMap = new Map((subsRes.data || []).map((s) => [s.company_id, s]));
  const waByCompany = new Map<string, { status: string; is_default: boolean | null }[]>();
  for (const wa of waRes.data || []) {
    const list = waByCompany.get(wa.company_id) || [];
    list.push({ status: wa.status, is_default: wa.is_default });
    waByCompany.set(wa.company_id, list);
  }
  const activeCompanyIds = new Set((recentMsgRes.data || []).map((m) => m.company_id));

  const items: ActionCenterItem[] = [];

  for (const company of activeCompanies) {
    const sub = subMap.get(company.id);
    const companyName = company.company_name;

    if (sub && sub.messages_limit > 0) {
      const used = sub.messages_used || 0;
      const limit = sub.messages_limit;
      const pct = Math.round((used / limit) * 100);

      if (pct >= 100) {
        items.push({
          id: `quota_exhausted-${company.id}`,
          type: 'quota_exhausted',
          category: 'quota',
          severity: 'critical',
          company_id: company.id,
          company_name: companyName,
          meta: { quota_percent: pct, messages_used: used, messages_limit: limit },
        });
      } else if (pct >= QUOTA_WARNING_PERCENT) {
        items.push({
          id: `quota_high-${company.id}`,
          type: 'quota_high',
          category: 'quota',
          severity: 'warning',
          company_id: company.id,
          company_name: companyName,
          meta: { quota_percent: pct, messages_used: used, messages_limit: limit },
        });
      }
    }

    const waConfigs = waByCompany.get(company.id) || [];
    if (waConfigs.length > 0 && !waConfigs.some((c) => c.status === 'connected')) {
      items.push({
        id: `whatsapp_disconnected-${company.id}`,
        type: 'whatsapp_disconnected',
        category: 'whatsapp',
        severity: 'critical',
        company_id: company.id,
        company_name: companyName,
        meta: {},
      });
    }

    const isTrial =
      company.status === 'trial' || sub?.status === 'trial';
    if (isTrial && sub) {
      const trialEnd = resolveTrialEnd(company.created_at, sub);
      const daysLeft = daysUntil(trialEnd);

      if (daysLeft < 0) {
        items.push({
          id: `trial_expired-${company.id}`,
          type: 'trial_expired',
          category: 'trial',
          severity: 'critical',
          company_id: company.id,
          company_name: companyName,
          meta: { days_left: daysLeft, trial_end: trialEnd.toISOString() },
        });
      } else if (daysLeft <= TRIAL_WARNING_DAYS) {
        items.push({
          id: `trial_ending-${company.id}`,
          type: 'trial_ending',
          category: 'trial',
          severity: daysLeft <= 3 ? 'critical' : 'warning',
          company_id: company.id,
          company_name: companyName,
          meta: { days_left: daysLeft, trial_end: trialEnd.toISOString() },
        });
      }
    }

    const companyAgeMs = Date.now() - new Date(company.created_at).getTime();
    const isOlderThanDay = companyAgeMs > INACTIVE_HOURS * 60 * 60 * 1000;
    if (company.status === 'active' && isOlderThanDay && !activeCompanyIds.has(company.id)) {
      items.push({
        id: `inactive_messaging-${company.id}`,
        type: 'inactive_messaging',
        category: 'activity',
        severity: 'info',
        company_id: company.id,
        company_name: companyName,
        meta: { hours_inactive: INACTIVE_HOURS },
      });
    }
  }

  for (const ticket of ticketsRes.data || []) {
    const company = companyMap.get(ticket.company_id);
    if (!company) continue;

    items.push({
      id: `open_ticket-${ticket.id}`,
      type: 'open_ticket',
      category: 'tickets',
      severity: ticket.priority === 'high' || ticket.priority === 'urgent' ? 'critical' : 'warning',
      company_id: ticket.company_id,
      company_name: company.company_name,
      meta: {
        ticket_id: ticket.id,
        ticket_subject: ticket.subject,
        ticket_priority: ticket.priority,
      },
    });
  }

  items.sort((a, b) => {
    const sev = severityRank(a.severity) - severityRank(b.severity);
    if (sev !== 0) return sev;
    return a.company_name.localeCompare(b.company_name, 'tr');
  });

  return {
    total: items.length,
    critical_count: items.filter((i) => i.severity === 'critical').length,
    warning_count: items.filter((i) => i.severity === 'warning').length,
    items,
  };
}

export type WhatsAppHealthStatus =
  | 'connected'
  | 'disconnected'
  | 'qr_pending'
  | 'reconnecting'
  | 'error'
  | 'not_configured';

export type WhatsAppConnectionType = 'qr' | 'api' | 'none';

export interface WhatsAppHealthAccount {
  account_id: string;
  company_id: string;
  company_name: string;
  company_status: string;
  label: string | null;
  phone_number: string | null;
  db_status: string;
  health_status: WhatsAppHealthStatus;
  connection_type: WhatsAppConnectionType;
  is_default: boolean;
  is_active: boolean;
  last_synced_at: string | null;
  last_message_at: string | null;
  updated_at: string | null;
  live_connected: boolean | null;
}

export interface WhatsAppHealthSummary {
  total_accounts: number;
  connected: number;
  disconnected: number;
  qr_pending: number;
  reconnecting: number;
  error: number;
  issues: number;
}

export interface WhatsAppHealthData {
  summary: WhatsAppHealthSummary;
  accounts: WhatsAppHealthAccount[];
  checked_at: string;
}

function resolveConnectionType(
  businessAccountId: string | null | undefined,
  accessToken: string | null | undefined
): WhatsAppConnectionType {
  if (businessAccountId?.startsWith('baileys:')) return 'qr';
  if (accessToken && businessAccountId && !businessAccountId.startsWith('baileys:')) return 'api';
  return 'none';
}

function resolveHealthStatus(
  dbStatus: string,
  pendingQr: boolean,
  connectionType: WhatsAppConnectionType,
  live: { connected: boolean; reconnecting: boolean } | null
): WhatsAppHealthStatus {
  if (pendingQr) return 'qr_pending';
  if (live?.reconnecting) return 'reconnecting';
  if (connectionType === 'qr' && live) {
    if (live.connected) return 'connected';
    if (dbStatus === 'connected') return 'disconnected';
  }
  if (dbStatus === 'connected') return 'connected';
  if (dbStatus === 'error') return 'error';
  if (dbStatus === 'pending') return 'qr_pending';
  return 'disconnected';
}

function isIssueStatus(status: WhatsAppHealthStatus): boolean {
  return status !== 'connected';
}

export async function getWhatsAppHealthMonitor(options?: {
  status?: string;
  search?: string;
}): Promise<WhatsAppHealthData> {
  const nowIso = new Date().toISOString();
  const search = options?.search?.trim().toLowerCase() || '';
  const statusFilter = options?.status || 'all';

  const { data: companies, error: companiesError } = await adminClient
    .from('companies')
    .select('id, company_name, status')
    .in('status', ['active', 'trial', 'suspended'])
    .order('company_name');

  if (companiesError) throw new Error(companiesError.message);

  const companyMap = new Map((companies || []).map((c) => [c.id, c]));
  const companyIds = [...companyMap.keys()];

  if (companyIds.length === 0) {
    return {
      summary: {
        total_accounts: 0,
        connected: 0,
        disconnected: 0,
        qr_pending: 0,
        reconnecting: 0,
        error: 0,
        issues: 0,
      },
      accounts: [],
      checked_at: nowIso,
    };
  }

  const [configsRes, qrRes, messagesRes] = await Promise.all([
    adminClient
      .from('whatsapp_configs')
      .select(
        'id, company_id, label, phone_number, business_account_id, access_token, status, is_active, is_default, last_synced_at, updated_at'
      )
      .in('company_id', companyIds),
    adminClient
      .from('whatsapp_qr_sessions')
      .select('whatsapp_account_id, status, expires_at')
      .in('status', ['pending', 'scanned'])
      .gt('expires_at', nowIso),
    adminClient
      .from('messages')
      .select('company_id, whatsapp_account_id, created_at')
      .in('company_id', companyIds)
      .order('created_at', { ascending: false })
      .limit(5000),
  ]);

  if (configsRes.error) throw new Error(configsRes.error.message);
  if (qrRes.error) throw new Error(qrRes.error.message);
  if (messagesRes.error) throw new Error(messagesRes.error.message);

  const pendingQrAccounts = new Set(
    (qrRes.data || [])
      .map((s) => s.whatsapp_account_id)
      .filter((id): id is string => !!id)
  );

  const lastMessageByAccount = new Map<string, string>();
  const lastMessageByCompany = new Map<string, string>();
  for (const msg of messagesRes.data || []) {
    if (msg.whatsapp_account_id && !lastMessageByAccount.has(msg.whatsapp_account_id)) {
      lastMessageByAccount.set(msg.whatsapp_account_id, msg.created_at);
    }
    if (!lastMessageByCompany.has(msg.company_id)) {
      lastMessageByCompany.set(msg.company_id, msg.created_at);
    }
  }

  const useLiveBaileys = !config.isVercel && !config.demoMode;
  const accounts: WhatsAppHealthAccount[] = [];

  for (const row of configsRes.data || []) {
    const company = companyMap.get(row.company_id);
    if (!company) continue;

    const connectionType = resolveConnectionType(row.business_account_id, row.access_token);
    let live: { connected: boolean; reconnecting: boolean } | null = null;
    let baileysPhone: string | null = null;

    if (useLiveBaileys && connectionType === 'qr') {
      const baileys = getBaileysConnectionStatus(row.id);
      baileysPhone = baileys.phone;
      live = {
        connected: baileys.connected,
        reconnecting: isBaileysReconnecting(row.id),
      };
    }

    const healthStatus = resolveHealthStatus(
      row.status,
      pendingQrAccounts.has(row.id),
      connectionType,
      live
    );

    const phone = (live?.connected && baileysPhone) || row.phone_number;

    accounts.push({
      account_id: row.id,
      company_id: row.company_id,
      company_name: company.company_name,
      company_status: company.status,
      label: row.label,
      phone_number: phone,
      db_status: row.status,
      health_status: healthStatus,
      connection_type: connectionType,
      is_default: !!row.is_default,
      is_active: row.is_active !== false,
      last_synced_at: row.last_synced_at,
      last_message_at:
        lastMessageByAccount.get(row.id) || lastMessageByCompany.get(row.company_id) || null,
      updated_at: row.updated_at,
      live_connected: live?.connected ?? null,
    });
  }

  accounts.sort((a, b) => {
    const issueA = isIssueStatus(a.health_status) ? 0 : 1;
    const issueB = isIssueStatus(b.health_status) ? 0 : 1;
    if (issueA !== issueB) return issueA - issueB;
    return a.company_name.localeCompare(b.company_name, 'tr');
  });

  const summary: WhatsAppHealthSummary = {
    total_accounts: accounts.length,
    connected: accounts.filter((a) => a.health_status === 'connected').length,
    disconnected: accounts.filter((a) => a.health_status === 'disconnected').length,
    qr_pending: accounts.filter((a) => a.health_status === 'qr_pending').length,
    reconnecting: accounts.filter((a) => a.health_status === 'reconnecting').length,
    error: accounts.filter((a) => a.health_status === 'error').length,
    issues: accounts.filter((a) => isIssueStatus(a.health_status)).length,
  };

  let filtered = accounts;
  if (search) {
    filtered = filtered.filter(
      (a) =>
        a.company_name.toLowerCase().includes(search) ||
        (a.phone_number && a.phone_number.includes(search)) ||
        (a.label && a.label.toLowerCase().includes(search))
    );
  }

  if (statusFilter === 'connected') {
    filtered = filtered.filter((a) => a.health_status === 'connected');
  } else if (statusFilter === 'disconnected') {
    filtered = filtered.filter((a) => a.health_status === 'disconnected');
  } else if (statusFilter === 'qr_pending') {
    filtered = filtered.filter((a) => a.health_status === 'qr_pending');
  } else if (statusFilter === 'reconnecting') {
    filtered = filtered.filter((a) => a.health_status === 'reconnecting');
  } else if (statusFilter === 'error') {
    filtered = filtered.filter((a) => a.health_status === 'error');
  } else if (statusFilter === 'issues') {
    filtered = filtered.filter((a) => isIssueStatus(a.health_status));
  }

  return { summary, accounts: filtered, checked_at: nowIso };
}

export { PLAN_LIMITS };

export interface CompanyAdminNote {
  id: string;
  company_id: string;
  content: string;
  author_profile_id: string | null;
  author_name: string;
  created_at: string;
}

export async function listCompanyAdminNotes(companyId: string): Promise<CompanyAdminNote[]> {
  const { data, error } = await adminClient
    .from('company_admin_notes')
    .select('id, company_id, content, author_profile_id, author_name, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function createCompanyAdminNote(
  companyId: string,
  content: string,
  author?: { profileId?: string | null; name?: string }
): Promise<CompanyAdminNote> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Not içeriği boş olamaz');

  const { data: company, error: companyError } = await adminClient
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .single();

  if (companyError || !company) throw new Error('Şirket bulunamadı');

  const { data, error } = await adminClient
    .from('company_admin_notes')
    .insert({
      company_id: companyId,
      content: trimmed,
      author_profile_id: author?.profileId || null,
      author_name: author?.name?.trim() || 'Platform Admin',
    })
    .select('id, company_id, content, author_profile_id, author_name, created_at')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteCompanyAdminNote(companyId: string, noteId: string): Promise<void> {
  const { error, count } = await adminClient
    .from('company_admin_notes')
    .delete({ count: 'exact' })
    .eq('id', noteId)
    .eq('company_id', companyId);

  if (error) throw new Error(error.message);
  if (!count) throw new Error('Not bulunamadı');
}
