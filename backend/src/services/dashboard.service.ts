/**
 * Dashboard statistics service
 */

import { adminClient } from '../database/supabase';
import { demoDashboardStats, demoPlatformStats } from '../demo/mockData';
import { DashboardStats } from '../types';
import { getMonthStartISO } from '../utils/date';
import { getConversationStatsForCompany } from './conversation-count.service';

export async function getDashboardStats(companyId: string, useDemoData = false): Promise<DashboardStats> {
  if (useDemoData) return demoDashboardStats;

  const monthStart = getMonthStartISO();

  const [
    conversationStats,
    aiResult,
    transferredResult,
    customersResult,
    subscriptionResult,
    aiLogsResult,
  ] = await Promise.all([
    getConversationStatsForCompany(companyId),
    adminClient
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('sender_type', 'ai'),
    adminClient
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'transferred'),
    adminClient
      .from('messages')
      .select('customer_phone')
      .eq('company_id', companyId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    adminClient
      .from('subscriptions')
      .select('messages_used, messages_limit')
      .eq('company_id', companyId)
      .single(),
    adminClient
      .from('ai_usage_logs')
      .select('cached, skipped, total_tokens')
      .eq('company_id', companyId)
      .gte('created_at', monthStart),
  ]);

  const uniqueCustomers = new Set(
    (customersResult.data || []).map((m: { customer_phone: string }) => m.customer_phone)
  );

  const aiLogs = aiLogsResult.data || [];
  const aiApiCallsFromLogs = aiLogs.filter((l) => !l.skipped && !l.cached).length;
  const aiApiCallsFromMessages = aiResult.count || 0;
  const aiApiCalls = Math.max(aiApiCallsFromLogs, aiApiCallsFromMessages);
  const aiCachedHits = aiLogs.filter((l) => l.cached).length;
  const aiSkipped = aiLogs.filter((l) => l.skipped).length;
  const aiTokensUsed = aiLogs.reduce((sum, l) => sum + (l.total_tokens || 0), 0);

  return {
    total_conversations: conversationStats.total_conversations,
    today_conversations: conversationStats.today_conversations,
    ai_responses: aiResult.count || 0,
    transferred: transferredResult.count || 0,
    active_customers: uniqueCustomers.size,
    messages_used: subscriptionResult.data?.messages_used || 0,
    messages_limit: subscriptionResult.data?.messages_limit || 1000,
    ai_api_calls: aiApiCalls,
    ai_cached_hits: aiCachedHits,
    ai_skipped: aiSkipped,
    ai_tokens_used: aiTokensUsed,
  };
}

export async function getPlatformStats(useDemoData = false) {
  if (useDemoData) return demoPlatformStats;
  const [companies, totalConversations, subscriptions] = await Promise.all([
    adminClient.from('companies').select('id', { count: 'exact', head: true }),
    getPlatformConversationCount(),
    adminClient
      .from('subscriptions')
      .select('messages_used')
      .eq('status', 'active'),
  ]);

  const totalMessagesUsed = (subscriptions.data || []).reduce(
    (sum: number, s: { messages_used: number }) => sum + s.messages_used,
    0
  );

  return {
    total_companies: companies.count || 0,
    total_conversations: totalConversations,
    total_messages_used: totalMessagesUsed,
    active_subscriptions: subscriptions.data?.length || 0,
  };
}
