/**
 * AI assistant performance detail page
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Bot, ArrowRightLeft, Users, ChevronLeft, MessageSquare,
} from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Spinner, Button } from '@/components/ui';
import type { DashboardStats } from '@/types';

export function AiInsightsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardStats>('/dashboard'),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const aiResponses = stats?.ai_responses ?? 0;
  const transferred = stats?.transferred ?? 0;
  const totalHandled = aiResponses + transferred;
  const autoReplyPercent = totalHandled > 0 ? Math.round((aiResponses / totalHandled) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('aiInsights.title')}
        description={t('aiInsights.description')}
        action={
          <Button variant="outline" size="sm" asChild>
            <Link to="/panel/dashboard">
              <ChevronLeft className="h-4 w-4" />
              {t('common.back')}
            </Link>
          </Button>
        }
      />

      <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-violet-800 p-6 text-white shadow-lg sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Bot className="h-7 w-7" />
          </div>
          <div>
            <p className="text-3xl font-bold tabular-nums sm:text-4xl">{aiResponses.toLocaleString(locale)}</p>
            <p className="mt-1 text-violet-100">{t('dashboard.autoReplies')}</p>
            {totalHandled > 0 && (
              <p className="mt-3 text-sm text-violet-200">
                {t('dashboard.autoReplyPercent', { percent: autoReplyPercent })}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowRightLeft className="h-5 w-5 text-orange-500" />
              {t('dashboard.transferred')}
            </CardTitle>
            <CardDescription>{t('dashboard.transferredDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{transferred.toLocaleString(locale)}</p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link to="/panel/tickets">{t('aiInsights.viewTickets')}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-cyan-600" />
              {t('dashboard.activeCustomers')}
            </CardTitle>
            <CardDescription>{t('dashboard.customersDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{(stats?.active_customers ?? 0).toLocaleString(locale)}</p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link to="/panel/customers">{t('aiInsights.viewCustomers')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <MessageSquare className="h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm text-slate-600">{t('dashboard.aiHint')}</p>
          </div>
          <Button size="sm" asChild>
            <Link to="/panel/knowledge">{t('aiInsights.editKnowledge')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
