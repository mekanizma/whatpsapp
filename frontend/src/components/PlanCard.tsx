/**
 * Abonelik paketi kartı — müşteri ve admin görünümü
 */

import { useMemo } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, Badge } from '@/components/ui';
import {
  formatPlanPrice,
  resolvePlanDisplayPrice,
  resolvePlanFeatures,
  resolvePlanTagline,
} from '@/lib/plan-format';
import { localizePlan, resolveLocaleFromLanguage, resolvePlanBadgeLabel } from '@/lib/plan-localize';
import type { BillingPeriod } from '@/lib/plan-format';
import { cn } from '@/lib/utils';

export interface PlanCardData {
  id?: string;
  plan_type: string;
  name: string;
  name_en?: string | null;
  description?: string | null;
  description_en?: string | null;
  features?: string[] | null;
  features_en?: string[] | null;
  message_limit: number;
  user_limit: number;
  price_monthly: number;
  price_yearly?: number | null;
  currency?: string | null;
  is_active?: boolean;
}

interface PlanCardProps {
  plan: PlanCardData;
  locale?: string;
  billingPeriod?: BillingPeriod;
  highlighted?: boolean;
  embedded?: boolean;
  variant?: 'default' | 'landing';
  className?: string;
}

const TIER_ACCENTS: Record<string, string> = {
  starter: 'from-teal-400 via-emerald-400 to-green-500',
  business: 'from-emerald-400 via-primary to-teal-500',
  enterprise: 'from-violet-400 via-indigo-400 to-blue-500',
};

function FeatureItem({ feature, landing }: { feature: string; landing?: boolean }) {
  return (
    <li className="flex gap-3 text-sm leading-snug text-slate-700">
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          landing ? 'bg-emerald-500/12' : 'bg-emerald-500/10'
        )}
      >
        <Check className="h-3 w-3 text-emerald-600" aria-hidden />
      </span>
      <span>{feature}</span>
    </li>
  );
}

function LimitsBlock({
  messageLabel,
  userLabel,
  label,
  landing,
  highlighted,
}: {
  messageLabel: string;
  userLabel: string;
  label: string;
  landing?: boolean;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        'mt-auto space-y-2.5 rounded-xl border p-4',
        landing
          ? highlighted
            ? 'border-primary/15 bg-gradient-to-br from-primary/[0.06] to-emerald-50/80'
            : 'border-slate-100 bg-gradient-to-br from-slate-50 to-white'
          : 'border-slate-100 bg-slate-50/90 p-3.5'
      )}
    >
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <ul className="space-y-2 text-sm text-slate-700">
        <li className="flex items-center gap-2.5">
          <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          {messageLabel}
        </li>
        <li className="flex items-center gap-2.5">
          <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          {userLabel}
        </li>
      </ul>
    </div>
  );
}

export function PlanCard({
  plan,
  locale,
  billingPeriod = 'monthly',
  highlighted,
  embedded,
  variant = 'default',
  className,
}: PlanCardProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const displayLocale = locale ?? resolveLocaleFromLanguage(language);
  const displayPlan = useMemo(() => localizePlan(plan, language), [plan, language]);
  const features = resolvePlanFeatures(displayPlan.features, displayPlan.description, language);
  const tagline = resolvePlanTagline(displayPlan.description, displayPlan.features);
  const planLabel = resolvePlanBadgeLabel(plan, t, displayLocale, language);
  const { price, period, fallbackFromYearly } = resolvePlanDisplayPrice(plan, billingPeriod);
  const isLanding = variant === 'landing';
  const accent = TIER_ACCENTS[plan.plan_type] ?? TIER_ACCENTS.business;
  const formattedPrice = formatPlanPrice(price, plan.currency || 'TRY', displayLocale);

  const messageLabel =
    plan.message_limit >= 999999
      ? t('subscription.unlimitedMessages')
      : plan.message_limit === 1
        ? t('subscription.messageOne')
        : t('subscription.messages', { count: plan.message_limit.toLocaleString(displayLocale) });

  const userLabel =
    plan.user_limit >= 999
      ? t('subscription.unlimitedUsers')
      : plan.user_limit === 1
        ? t('subscription.userOne')
        : t('subscription.users', { count: plan.user_limit.toLocaleString(displayLocale) });

  const priceBlock = (
    <div className={cn('border-b border-slate-100', isLanding ? 'mb-6 pb-6' : 'mb-5 pb-5')}>
      <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
        <p
          className={cn(
            'max-w-full break-words font-extrabold tabular-nums tracking-tight text-slate-900',
            isLanding ? 'text-[1.75rem] leading-none sm:text-4xl lg:text-[2.75rem]' : 'text-3xl sm:text-[2rem]'
          )}
        >
          {formattedPrice}
        </p>
        <p className="mb-0.5 shrink-0 text-sm font-medium text-slate-500">
          {period === 'yearly' ? t('subscription.perYear') : t('subscription.perMonth')}
        </p>
      </div>
      {period === 'yearly' && price > 0 && (
        <p className="mt-1.5 text-xs text-slate-400">
          {t('subscription.yearlyMonthlyEquivalent', {
            amount: formatPlanPrice(price / 12, plan.currency || 'TRY', displayLocale),
          })}
        </p>
      )}
      {fallbackFromYearly && (
        <p className="mt-2 text-xs text-amber-700">{t('subscription.yearlyNotAvailable')}</p>
      )}
    </div>
  );

  const body = (
    <div className={cn('flex h-full flex-col', embedded ? 'p-0' : isLanding ? 'p-5 sm:p-7' : 'p-5 sm:p-6')}>
      <div className={cn('mb-5', isLanding && 'mb-6')}>
        {isLanding ? (
          <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-slate-600">
            {planLabel}
          </span>
        ) : (
          <Badge variant="info" className="mb-2">
            {planLabel}
          </Badge>
        )}
        <h3
          className={cn(
            'font-bold tracking-tight text-slate-900',
            isLanding ? 'mt-3 text-2xl' : 'text-xl'
          )}
        >
          {displayPlan.name}
        </h3>
        {tagline && (
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{tagline}</p>
        )}
      </div>

      {priceBlock}

      {features.length > 0 && (
        <ul className={cn('mb-6 flex-1 space-y-3', !isLanding && 'mb-5 space-y-2.5')}>
          {features.map((feature) => (
            <FeatureItem key={feature} feature={feature} landing={isLanding} />
          ))}
        </ul>
      )}

      <LimitsBlock
        messageLabel={messageLabel}
        userLabel={userLabel}
        label={t('subscription.aiConversationsPerMonth')}
        landing={isLanding}
        highlighted={highlighted}
      />
    </div>
  );

  if (embedded) {
    return <div className={className}>{body}</div>;
  }

  if (isLanding) {
    return (
      <div
        className={cn(
          'plan-card-landing group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white/95 backdrop-blur-sm transition-all duration-300',
          highlighted
            ? 'border-primary/30 shadow-xl shadow-primary/10 ring-1 ring-primary/20 lg:-translate-y-1'
            : 'border-white/30 shadow-lg shadow-black/10 hover:-translate-y-0.5 hover:border-white/50 hover:shadow-xl',
          className
        )}
      >
        {highlighted && (
          <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500 to-primary px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-white shadow-md shadow-primary/30">
            <Sparkles className="h-3 w-3" aria-hidden />
            {t('pricing.mostPopular')}
          </div>
        )}
        <div className={cn('h-1 w-full bg-gradient-to-r', accent)} aria-hidden />
        <div className={cn(highlighted && 'pt-6')}>{body}</div>
      </div>
    );
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
