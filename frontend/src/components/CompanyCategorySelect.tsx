/**
 * Şirket sektörü seçimi — tüm formlarda ortak liste
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  COMPANY_CATEGORY_VALUES,
  companyCategoryI18nKey,
  type CompanyCategory,
} from '@/lib/company-categories';

const SELECT_CLASS =
  'flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60';

export interface CompanyCategorySelectProps {
  id?: string;
  value: string;
  onChange: (value: CompanyCategory) => void;
  disabled?: boolean;
  className?: string;
  /** Boş seçenek göster (ör. filtre) */
  allowEmpty?: boolean;
  emptyLabel?: string;
}

export function CompanyCategorySelect({
  id,
  value,
  onChange,
  disabled,
  className,
  allowEmpty,
  emptyLabel,
}: CompanyCategorySelectProps) {
  const { t } = useTranslation();

  return (
    <select
      id={id}
      className={cn(SELECT_CLASS, className)}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as CompanyCategory)}
    >
      {allowEmpty && (
        <option value="">{emptyLabel ?? t('common.all', { defaultValue: 'Tümü' })}</option>
      )}
      {COMPANY_CATEGORY_VALUES.map((cat) => (
        <option key={cat} value={cat}>
          {t(companyCategoryI18nKey(cat))}
        </option>
      ))}
    </select>
  );
}
