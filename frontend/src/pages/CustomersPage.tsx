/**
 * Active customers list — last 30 days
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Users, Phone, Clock, ChevronLeft, MessageSquare } from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent, Spinner, Button, Badge } from '@/components/ui';
import type { Conversation } from '@/types';

export function CustomersPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<Conversation[]>('/messages'),
    refetchInterval: 30000,
  });

  const sorted = [...(conversations || [])].sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('customers.title')}
        description={t('customers.description')}
        action={
          <Button variant="outline" size="sm" asChild>
            <Link to="/panel/dashboard">
              <ChevronLeft className="h-4 w-4" />
              {t('common.back')}
            </Link>
          </Button>
        }
      />

      <div className="flex items-center gap-3 rounded-xl bg-cyan-50 px-4 py-3 ring-1 ring-cyan-100">
        <Users className="h-5 w-5 text-cyan-600" />
        <p className="text-sm font-medium text-cyan-900">
          {t('customers.count', { count: sorted.length })}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('customers.empty')}
          description={t('customers.emptyDesc')}
        />
      ) : (
        <div className="space-y-3">
          {sorted.map((c) => (
            <Link
              key={c.customer_phone}
              to={`/panel/messages?phone=${encodeURIComponent(c.customer_phone)}`}
              className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <Card className="transition-all hover:border-primary/20 hover:shadow-md active:scale-[0.99]">
                <CardContent className="flex gap-4 p-4 sm:p-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">
                        {c.customer_name || c.customer_phone}
                      </p>
                      {c.status === 'transferred' && (
                        <Badge variant="warning">{t('customers.transferred')}</Badge>
                      )}
                    </div>
                    {c.customer_name && (
                      <p className="flex items-center gap-1 text-xs text-slate-500">
                        <Phone className="h-3 w-3" />
                        {c.customer_phone}
                      </p>
                    )}
                    <p className="line-clamp-1 text-sm text-slate-600">{c.last_message}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock className="h-3 w-3" />
                      {new Date(c.last_message_at).toLocaleString(locale)}
                    </p>
                  </div>
                  <MessageSquare className="mt-1 h-5 w-5 shrink-0 text-slate-300" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
