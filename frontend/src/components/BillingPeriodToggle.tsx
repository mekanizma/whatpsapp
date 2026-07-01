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
}

export function BillingPeriodToggle({ value, onChange, className }: BillingPeriodToggleProps) {
  const { t } = useTranslation();

  const options: { id: BillingPeriod; label: string }[] = [
    { id: 'monthly', label: t('subscription.billingMonthly') },
    { id: 'yearly', label: t('subscription.billingYearly') },
  ];

  return (
    <div
      className={cn(
        'inline-flex w-full max-w-xs rounded-xl border border-slate-200 bg-slate-100/80 p-1 sm:w-auto',
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
              selected
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
