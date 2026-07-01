/**
 * Abonelik paketi fiyat ve özellik yardımcıları
 */

export const PLAN_CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'] as const;
export type PlanCurrency = (typeof PLAN_CURRENCIES)[number];

export function formatPlanPrice(
  price: number,
  currency: string,
  locale: string
): string {
  const code = (currency || 'TRY').toUpperCase();
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: code === 'TRY' ? 0 : 2,
      maximumFractionDigits: code === 'TRY' ? 0 : 2,
    }).format(price);
  } catch {
    return `${code} ${Number(price).toLocaleString(locale)}`;
  }
}

export function parseLegacyDescriptionFeatures(description: string): string[] {
  const cleaned = description.trim();
  if (!cleaned) return [];

  if (/✅|✓|•/.test(cleaned)) {
    return cleaned
      .split(/(?:✅|✓)\s*/)
      .map((line) => line.replace(/^[•\-–—\s]+/, '').trim())
      .filter(Boolean);
  }

  if (cleaned.includes('\n')) {
    return cleaned
      .split('\n')
      .map((line) => line.replace(/^[•\-–—✓✅\s]+/, '').trim())
      .filter(Boolean);
  }

  return [cleaned];
}

export function resolvePlanFeatures(
  features: string[] | null | undefined,
  description: string | null | undefined
): string[] {
  if (features && features.length > 0) {
    return features.map((f) => f.trim()).filter(Boolean);
  }
  if (!description?.trim()) return [];
  return parseLegacyDescriptionFeatures(description);
}

export function resolvePlanTagline(
  description: string | null | undefined,
  features: string[] | null | undefined
): string | null {
  if (!description?.trim()) return null;
  if (features && features.length > 0) return description.trim();
  if (/✅|✓/.test(description)) return null;
  if (description.length > 120) return null;
  return description.trim();
}

export function featuresToTextarea(features: string[] | null | undefined): string {
  return (features || []).join('\n');
}

export function textareaToFeatures(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^[•\-–—✓✅\s]+/, '').trim())
    .filter(Boolean);
}
