/**
 * Aylık / yıllık fiyatlandırma seçici
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { BillingPeriod } from '@/lib/plan-format';

interface BillingPeriodToggleProps {
  value: BillingPeriod;
  onChange: (period: BillingPeriod) => void;
  className?: string;
  variant?: 'default' | 'landing';
}

export function BillingPeriodToggle({
  value,
  onChange,
  className,
  variant = 'default',
}: BillingPeriodToggleProps) {
  const { t } = useTranslation();
  const isLanding = variant === 'landing';

  const options: { id: BillingPeriod; label: string }[] = [
    { id: 'monthly', label: t('subscription.billingMonthly') },
    { id: 'yearly', label: t('subscription.billingYearly') },
  ];

  return (
    <div
      className={cn(
        'inline-flex w-full max-w-sm rounded-xl p-1 sm:w-auto sm:max-w-none',
        isLanding
          ? 'border border-white/15 bg-white/10 backdrop-blur-md'
          : 'border border-slate-200 bg-slate-100/80',
        className
      )}
      role="tablist"
      aria-label={t('subscription.billingPeriodLabel')}
    >
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              'min-h-[44px] flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors sm:min-w-[7.5rem] sm:flex-none',
              isLanding
                ? selected
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-white/75 hover:text-white'
                : selected
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
