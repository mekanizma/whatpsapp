/**
 * Abonelik paketi kartı — müşteri ve admin görünümü
 */

import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, Badge } from '@/components/ui';
import {
  formatPlanPrice,
  resolvePlanDisplayPrice,
  resolvePlanFeatures,
  resolvePlanTagline,
} from '@/lib/plan-format';
import type { BillingPeriod } from '@/lib/plan-format';
import { cn } from '@/lib/utils';

export interface PlanCardData {
  id?: string;
  plan_type: string;
  name: string;
  description?: string | null;
  features?: string[] | null;
  message_limit: number;
  user_limit: number;
  price_monthly: number;
  price_yearly?: number | null;
  currency?: string | null;
  is_active?: boolean;
}

interface PlanCardProps {
  plan: PlanCardData;
  locale: string;
  billingPeriod?: BillingPeriod;
  highlighted?: boolean;
  embedded?: boolean;
  className?: string;
}

export function PlanCard({
  plan,
  locale,
  billingPeriod = 'monthly',
  highlighted,
  embedded,
  className,
}: PlanCardProps) {
  const { t } = useTranslation();
  const features = resolvePlanFeatures(plan.features, plan.description);
  const tagline = resolvePlanTagline(plan.description, plan.features);
  const planLabel = t(`common.plans.${plan.plan_type}`, { defaultValue: plan.plan_type });
  const { price, period, fallbackFromYearly } = resolvePlanDisplayPrice(plan, billingPeriod);

  const messageLabel =
    plan.message_limit >= 999999
      ? t('subscription.unlimitedMessages')
      : t('subscription.messages', { count: plan.message_limit.toLocaleString(locale) });

  const userLabel =
    plan.user_limit >= 999
      ? t('subscription.unlimitedUsers')
      : t('subscription.users', { count: plan.user_limit });

  const body = (
    <div className={cn('flex h-full flex-col', embedded ? 'p-0' : 'p-5 sm:p-6')}>
        <div className="mb-4">
          <Badge variant="info" className="mb-2">
            {planLabel}
          </Badge>
          <h3 className="text-xl font-bold tracking-tight text-slate-900">{plan.name}</h3>
          {tagline && (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{tagline}</p>
          )}
        </div>

        <div className="mb-5 border-b border-slate-100 pb-5">
          <p className="text-3xl font-bold tracking-tight text-slate-900 sm:text-[2rem]">
            {formatPlanPrice(price, plan.currency || 'TRY', locale)}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {period === 'yearly' ? t('subscription.perYear') : t('subscription.perMonth')}
          </p>
          {period === 'yearly' && price > 0 && (
            <p className="mt-1 text-xs text-slate-400">
              {t('subscription.yearlyMonthlyEquivalent', {
                amount: formatPlanPrice(price / 12, plan.currency || 'TRY', locale),
              })}
            </p>
          )}
          {fallbackFromYearly && (
            <p className="mt-2 text-xs text-amber-700">{t('subscription.yearlyNotAvailable')}</p>
          )}
        </div>

        {features.length > 0 && (
          <ul className="mb-5 flex-1 space-y-2.5">
            {features.map((feature) => (
              <li key={feature} className="flex gap-2.5 text-sm leading-snug text-slate-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        )}

        <div
          className={cn(
            'mt-auto space-y-2 rounded-xl border border-slate-100 bg-slate-50/90 p-3.5',
            features.length === 0 && 'flex-1'
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('subscription.aiConversationsPerMonth')}
          </p>
          <ul className="space-y-2 text-sm text-slate-700">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-primary" />
              {messageLabel}
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-primary" />
              {userLabel}
            </li>
          </ul>
        </div>
    </div>
  );

  if (embedded) {
    return <div className={className}>{body}</div>;
  }

  return (
    <Card
      className={cn(
        'flex h-full flex-col overflow-hidden transition-shadow',
        highlighted && 'ring-2 ring-primary/30 shadow-md',
        className
      )}
    >
      <CardContent className="p-0">{body}</CardContent>
    </Card>
  );
}
