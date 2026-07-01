/**
 * Şirketin paket özellikleri listesi
 */

import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { resolvePlanFeatures } from '@/lib/plan-format';
import { cn } from '@/lib/utils';

interface CompanyPlanFeaturesProps {
  planType: string;
  planName?: string;
  description?: string | null;
  features?: string[] | null;
  messageLimit?: number;
  userLimit?: number;
  compact?: boolean;
  className?: string;
}

export function CompanyPlanFeatures({
  planType,
  planName,
  description,
  features,
  messageLimit,
  userLimit,
  compact,
  className,
}: CompanyPlanFeaturesProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const resolved = resolvePlanFeatures(features, description);
  const planLabel = planName || t(`common.plans.${planType}`, { defaultValue: planType });

  const quotaFeatures: string[] = [];
  if (messageLimit != null && messageLimit > 0) {
    quotaFeatures.push(
      messageLimit >= 999999
        ? t('subscription.unlimitedMessages')
        : t('subscription.messages', { count: messageLimit.toLocaleString(locale) })
    );
  }
  if (userLimit != null && userLimit > 0) {
    quotaFeatures.push(
      userLimit >= 999
        ? t('subscription.unlimitedUsers')
        : t('subscription.users', { count: userLimit })
    );
  }

  const items = [...resolved, ...quotaFeatures.filter((q) => !resolved.some((r) => r.includes(q.slice(0, 8))))];

  if (items.length === 0) {
    return (
      <p className={cn('text-sm text-slate-500', className)}>
        {t('admin.companyDetail.noPlanFeatures')}
      </p>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {!compact && (
        <p className="text-sm font-semibold text-slate-800">
          {t('admin.companyDetail.planFeaturesTitle', { plan: planLabel })}
        </p>
      )}
      <ul className={cn('space-y-1.5', compact ? 'grid gap-1.5 sm:grid-cols-2' : '')}>
        {items.map((feature) => (
          <li
            key={feature}
            className={cn(
              'flex gap-2 text-slate-700',
              compact ? 'text-xs' : 'text-sm'
            )}
          >
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
