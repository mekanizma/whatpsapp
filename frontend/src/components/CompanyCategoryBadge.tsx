/**
 * Şirket sektörü etiketi — liste ve detay görünümleri
 */

import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui';
import { companyCategoryI18nKey, isCompanyCategory } from '@/lib/company-categories';

type CategoryBadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface CompanyCategoryBadgeProps {
  category: string | null | undefined;
  variant?: CategoryBadgeVariant;
  className?: string;
}

export function CompanyCategoryBadge({
  category,
  variant = 'info',
  className,
}: CompanyCategoryBadgeProps) {
  const { t } = useTranslation();
  if (!category) return null;

  const label = isCompanyCategory(category)
    ? t(companyCategoryI18nKey(category))
    : category;

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}

export function useCompanyCategoryLabel(category: string | null | undefined): string {
  const { t } = useTranslation();
  if (!category) return '';
  return isCompanyCategory(category) ? t(companyCategoryI18nKey(category)) : category;
}
