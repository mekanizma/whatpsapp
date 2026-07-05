/**
 * Dashboard page
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  MessageSquare,
  Bot,
  UserCheck,
  Users,
  TrendingUp,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { api } from '@/services/api';
import { StatCard } from '@/components/StatCard';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Spinner, Badge, Button } from '@/components/ui';
import type { DashboardStats } from '@/types';

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardStats>('/dashboard'),
    refetchInterval: 30000,
  });

  const getQuotaStatus = (percent: number): { label: string; variant: 'success' | 'warning' | 'danger' | 'info' } => {
    if (percent >= 90) return { label: t('dashboard.quotaStatus.critical'), variant: 'danger' };
    if (percent >= 70) return { label: t('dashboard.quotaStatus.high'), variant: 'warning' };
    if (percent >= 30) return { label: t('dashboard.quotaStatus.normal'), variant: 'info' };
    return { label: t('dashboard.quotaStatus.low'), variant: 'success' };
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const messagesUsed = stats?.messages_used ?? 0;
  const messagesLimit = stats?.messages_limit ?? 0;
  const messagesRemaining = Math.max(messagesLimit - messagesUsed, 0);
  const usagePercent = messagesLimit > 0 ? Math.round((messagesUsed / messagesLimit) * 100) : 0;
  const quotaStatus = getQuotaStatus(usagePercent);

  const aiResponses = stats?.ai_responses ?? 0;
  const transferred = stats?.transferred ?? 0;
  const totalHandled = aiResponses + transferred;
  const autoReplyPercent = totalHandled > 0 ? Math.round((aiResponses / totalHandled) * 100) : 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('layout.titles.dashboard')}
        description={t('dashboard.description')}
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title={t('dashboard.totalConversations')}
          value={stats?.total_conversations ?? 0}
          trend={t('dashboard.conversationCountHint')}
          icon={MessageSquare}
          color="text-sky-600"
          bgColor="bg-sky-50"
          to="/panel/messages"
        />
        <StatCard
          title={t('dashboard.todayConversations')}
          value={stats?.today_conversations ?? 0}
          trend={t('dashboard.todayConversationCountHint')}
          icon={TrendingUp}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
          to="/panel/activity/today"
        />
        <StatCard title={t('dashboard.aiResponses')} value={aiResponses} icon={Bot} color="text-violet-600" bgColor="bg-violet-50" to="/panel/ai-insights" />
        <StatCard title={t('dashboard.transferred')} value={transferred} icon={ArrowRightLeft} color="text-orange-600" bgColor="bg-orange-50" to="/panel/tickets" />
        <StatCard title={t('dashboard.activeCustomers')} value={stats?.active_customers ?? 0} icon={Users} color="text-cyan-600" bgColor="bg-cyan-50" to="/panel/customers" />
        <StatCard title={t('dashboard.messageQuota')} value={`${messagesUsed} / ${messagesLimit}`} icon={UserCheck} color="text-primary" bgColor="bg-primary/10" to="/panel/subscription" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Link
          to="/panel/ai-insights"
          className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
        >
        <Card className="h-full transition-all duration-200 group-hover:border-violet-200 group-hover:shadow-md group-active:scale-[0.995]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-violet-600" />
              {t('dashboard.aiSummary')}
            </CardTitle>
            <CardDescription>{t('dashboard.aiSummaryDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-violet-50 px-4 py-3 ring-1 ring-violet-100">
              <p className="text-2xl font-bold tabular-nums text-violet-700">
                {aiResponses.toLocaleString(locale)}
              </p>
              <p className="mt-0.5 text-sm font-medium text-violet-900">{t('dashboard.autoReplies')}</p>
              {totalHandled > 0 && (
                <p className="mt-2 text-xs text-violet-700/80">
                  {t('dashboard.autoReplyPercent', { percent: autoReplyPercent })}
                </p>
              )}
            </div>

            <ul className="space-y-3">
              <li className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                <ArrowRightLeft className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {t('dashboard.transferredCount', { count: transferred.toLocaleString(locale) })}
                  </p>
                  <p className="text-xs text-slate-500">{t('dashboard.transferredDesc')}</p>
                </div>
              </li>
              <li className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {t('dashboard.customersCount', { count: stats?.active_customers ?? 0 })}
                  </p>
                  <p className="text-xs text-slate-500">{t('dashboard.customersDesc')}</p>
                </div>
              </li>
            </ul>

            <p className="flex items-start gap-2 text-xs text-slate-500">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              {t('dashboard.aiHint')}
            </p>
            <p className="flex items-center justify-end gap-1 text-xs font-medium text-violet-600">
              {t('dashboard.viewDetails')}
              <ChevronRight className="h-4 w-4" />
            </p>
          </CardContent>
        </Card>
        </Link>

        <Link
          to="/panel/subscription"
          className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
        >
        <Card className="h-full transition-all duration-200 group-hover:border-primary/25 group-hover:shadow-md group-active:scale-[0.995]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              {t('dashboard.monthlyQuota')}
            </CardTitle>
            <CardDescription>{t('dashboard.monthlyQuotaDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-3xl font-bold tabular-nums text-slate-900">
                  {messagesRemaining.toLocaleString(locale)}
                </p>
                <p className="text-sm text-slate-500">{t('dashboard.messagesLeft')}</p>
              </div>
              <Badge variant={quotaStatus.variant}>{quotaStatus.label}</Badge>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">
                  {t('dashboard.used')}: <strong className="text-slate-900">{messagesUsed.toLocaleString(locale)}</strong>
                </span>
                <span className="text-slate-600">
                  {t('dashboard.total')}: <strong className="text-slate-900">{messagesLimit.toLocaleString(locale)}</strong>
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    usagePercent >= 90
                      ? 'bg-gradient-to-r from-red-500 to-orange-500'
                      : usagePercent >= 70
                        ? 'bg-gradient-to-r from-amber-500 to-orange-400'
                        : 'bg-gradient-to-r from-primary to-accent'
                  }`}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
              <p className="text-right text-xs text-slate-500">{t('dashboard.percentUsed', { percent: usagePercent })}</p>
            </div>

            {usagePercent >= 90 && (
              <div className="flex gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200/60">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{t('dashboard.quotaWarning')}</p>
              </div>
            )}

            <Button variant="outline" className="w-full justify-between sm:w-auto pointer-events-none" tabIndex={-1}>
              {t('dashboard.quotaDetails')}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
        </Link>
      </div>
    </div>
  );
}

