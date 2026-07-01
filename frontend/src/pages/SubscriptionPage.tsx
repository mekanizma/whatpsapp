/**
 * Subscription and usage page
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, AlertTriangle, Package } from 'lucide-react';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { PlanCard } from '@/components/PlanCard';
import { AiAddonCard } from '@/components/AiAddonCard';
import { BillingPeriodToggle } from '@/components/BillingPeriodToggle';
import { planHasYearlyPrice } from '@/lib/plan-format';
import type { BillingPeriod } from '@/lib/plan-format';
import { Card, CardContent, CardHeader, CardTitle, Spinner, Badge, Button } from '@/components/ui';
import type { AiConversationAddon, CurrentSubscription, SubscriptionUsage } from '@/types';
import { cn } from '@/lib/utils';

export function SubscriptionPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [purchaseMsg, setPurchaseMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const queryClient = useQueryClient();
  const companyPlan = useAuthStore((s) => s.companyPlan);

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['subscription-usage'],
    queryFn: () => api.get<SubscriptionUsage>('/subscriptions/usage'),
  });

  const { data: current, isLoading: currentLoading } = useQuery({
    queryKey: ['subscription-current'],
    queryFn: () => api.get<CurrentSubscription>('/subscriptions/current'),
  });

  const { data: addons, isLoading: addonsLoading } = useQuery({
    queryKey: ['subscription-addons'],
    queryFn: () => api.get<AiConversationAddon[]>('/subscriptions/addons'),
    enabled: !!usage?.quota_exhausted,
  });

  const purchaseMutation = useMutation({
    mutationFn: (addonId: string) =>
      api.post<{ messages_limit: number; messages_used: number }>(
        `/subscriptions/addons/${addonId}/purchase`,
        {}
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['subscription-usage'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-current'] });
      setPurchaseMsg({
        type: 'ok',
        text: t('subscription.addonPurchaseSuccess', { limit: data.messages_limit }),
      });
    },
    onError: (err) => {
      setPurchaseMsg({ type: 'err', text: err instanceof Error ? err.message : t('common.error') });
    },
  });

  const currentPlan = useMemo(() => {
    if (current?.plan) return current.plan;
    if (!companyPlan) return null;
    return {
      id: companyPlan.plan_type,
      plan_type: companyPlan.plan_type,
      name: companyPlan.name,
      description: companyPlan.description,
      features: companyPlan.features,
      message_limit: companyPlan.message_limit,
      user_limit: companyPlan.user_limit,
      price_monthly: 0,
      is_active: true,
    };
  }, [current?.plan, companyPlan]);

  const showBillingToggle = useMemo(
    () => currentPlan != null && planHasYearlyPrice(currentPlan),
    [currentPlan]
  );

  const quotaExhausted = usage?.quota_exhausted ?? false;
  const usagePct = Math.min(100, usage?.messages_percentage ?? 0);

  if (usageLoading || currentLoading) {
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
                <div
                  className={cn(
                    'h-2 rounded-full transition-all',
                    quotaExhausted ? 'bg-rose-500' : usagePct >= 80 ? 'bg-amber-500' : 'bg-primary'
                  )}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
              {quotaExhausted && (
                <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-rose-600">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {t('subscription.quotaExhausted')}
                </p>
              )}
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

      {currentPlan && (
        <div>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-slate-500" />
              <h2 className="text-lg font-semibold text-slate-900">{t('subscription.currentPlan')}</h2>
              <Badge variant="success">{t('subscription.activePlan')}</Badge>
            </div>
            {showBillingToggle && (
              <BillingPeriodToggle value={billingPeriod} onChange={setBillingPeriod} />
            )}
          </div>
          <div className="max-w-md">
            <PlanCard
              plan={currentPlan}
              locale={locale}
              billingPeriod={billingPeriod}
              highlighted
            />
          </div>
        </div>
      )}

      {quotaExhausted && (
        <div>
          <div className="mb-4 space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">{t('subscription.extraAddonsTitle')}</h2>
            <p className="text-sm text-slate-500">{t('subscription.extraAddonsDesc')}</p>
          </div>

          {purchaseMsg && (
            <p
              className={cn(
                'mb-4 rounded-lg px-4 py-3 text-sm',
                purchaseMsg.type === 'ok'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-rose-50 text-rose-800'
              )}
            >
              {purchaseMsg.text}
            </p>
          )}

          {addonsLoading ? (
            <div className="flex justify-center p-8"><Spinner className="h-6 w-6" /></div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {addons?.map((addon) => (
                <AiAddonCard
                  key={addon.id}
                  addon={addon}
                  locale={locale}
                  onPurchase={(id) => {
                    setPurchaseMsg(null);
                    purchaseMutation.mutate(id);
                  }}
                  purchasing={purchaseMutation.isPending && purchaseMutation.variables === addon.id}
                />
              ))}
            </div>
          )}

          {!addonsLoading && (!addons || addons.length === 0) && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-slate-500">
                {t('subscription.noAddons')}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {!quotaExhausted && usage && usagePct >= 80 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-amber-900">{t('subscription.quotaWarning')}</p>
            <Button variant="outline" size="sm" className="shrink-0 border-amber-300">
              {t('subscription.viewAddons')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
