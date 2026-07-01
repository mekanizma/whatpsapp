/**
 * Subscription and usage page
 */

import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import { api } from '@/services/api';
import { PlanCard } from '@/components/PlanCard';
import { Card, CardContent, CardHeader, CardTitle, Spinner, Badge } from '@/components/ui';
import type { SubscriptionPlan, SubscriptionUsage } from '@/types';

export function SubscriptionPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['subscription-usage'],
    queryFn: () => api.get<SubscriptionUsage>('/subscriptions/usage'),
  });

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => api.get<SubscriptionPlan[]>('/subscriptions/plans'),
  });

  if (usageLoading || plansLoading) {
    return <div className="flex justify-center p-8"><Spinner className="h-8 w-8" /></div>;
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold">{t('subscription.title')}</h1>
        <p className="text-gray-500">{t('subscription.description')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> {t('subscription.currentUsage')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-sm text-gray-500">{t('subscription.messageUsage')}</p>
              <p className="text-2xl font-bold">{usage?.messages_used} / {usage?.messages_limit}</p>
              <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${usage?.messages_percentage ?? 0}%` }} />
              </div>
            </div>
            <div>
              <p className="mb-1 text-sm text-gray-500">{t('subscription.userCount')}</p>
              <p className="text-2xl font-bold">{usage?.users_used} / {usage?.users_limit}</p>
              <Badge variant="info" className="mt-2">
                {usage?.status ? t(`common.status.${usage.status}`, { defaultValue: usage.status }) : ''}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">{t('subscription.availablePlans')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans?.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              locale={locale}
              highlighted={plan.plan_type === 'business'}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
