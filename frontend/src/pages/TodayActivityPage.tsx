/**
 * Today's message activity
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Clock, ChevronLeft, MessageSquare } from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent, Spinner, Button } from '@/components/ui';
import type { Conversation, DashboardStats } from '@/types';

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function TodayActivityPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardStats>('/dashboard'),
  });

  const { data: conversations, isLoading: convLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<Conversation[]>('/messages'),
    refetchInterval: 15000,
  });

  const todayConversations = (conversations || []).filter((c) => isToday(c.last_message_at));
  const isLoading = statsLoading || convLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('todayActivity.title')}
        description={t('todayActivity.description')}
        action={
          <Button variant="outline" size="sm" asChild>
            <Link to="/panel/dashboard">
              <ChevronLeft className="h-4 w-4" />
              {t('common.back')}
            </Link>
          </Button>
        }
      />

      <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-6 text-white shadow-lg sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <TrendingUp className="h-7 w-7" />
          </div>
          <div>
            <p className="text-3xl font-bold tabular-nums sm:text-4xl">
              {(stats?.today_conversations ?? 0).toLocaleString(locale)}
            </p>
            <p className="mt-1 text-emerald-100">{t('dashboard.todayConversations')}</p>
            <p className="mt-3 text-sm text-emerald-200">
              {t('todayActivity.activeChats', { count: todayConversations.length })}
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
      ) : todayConversations.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={t('todayActivity.empty')}
          description={t('todayActivity.emptyDesc')}
        />
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">{t('todayActivity.recentChats')}</h2>
          {todayConversations.map((c) => (
            <Link
              key={c.customer_phone}
              to={`/panel/messages?phone=${encodeURIComponent(c.customer_phone)}`}
              className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <Card className="transition-all hover:border-primary/20 hover:shadow-md active:scale-[0.99]">
                <CardContent className="flex gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{c.customer_name || c.customer_phone}</p>
                    <p className="line-clamp-1 text-sm text-slate-600">{c.last_message}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                      <Clock className="h-3 w-3" />
                      {new Date(c.last_message_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Button variant="outline" className="w-full sm:w-auto" asChild>
        <Link to="/panel/messages">{t('todayActivity.allMessages')}</Link>
      </Button>
    </div>
  );
}
