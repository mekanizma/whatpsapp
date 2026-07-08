/**
 * Abonelik paketi fiyat ve özellik yardımcıları
 */

import { isEnglishLanguage } from '@/lib/plan-localize';

export const PLAN_CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'] as const;
export type PlanCurrency = (typeof PLAN_CURRENCIES)[number];
export type BillingPeriod = 'monthly' | 'yearly';

/** API/DB'den gelen fiyatı güvenli sayıya çevirir */
export function normalizePlanPrice(value: unknown): number {
  if (value == null || value === '') return 0;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : 0;
}

export const HIGHLIGHTED_PLAN_TYPE = 'business';

function normalizePlanKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Business paketini plan_type veya görünen isimden tanır. */
export function isBusinessPlan(plan: { plan_type: string; name?: string | null }): boolean {
  if (normalizePlanKey(plan.plan_type) === HIGHLIGHTED_PLAN_TYPE) return true;
  return normalizePlanKey(plan.name || '') === HIGHLIGHTED_PLAN_TYPE;
}

export function isHighlightedPlan(
  plan: { id?: string; plan_type: string; name?: string | null },
  plans: { id?: string; plan_type: string; name?: string | null }[]
): boolean {
  const highlighted = plans.find(isBusinessPlan);
  if (!highlighted) return false;

  if (plan.id && highlighted.id) return plan.id === highlighted.id;
  return normalizePlanKey(plan.plan_type) === normalizePlanKey(highlighted.plan_type);
}

export function planHasYearlyPrice(plan: { price_yearly?: number | null }): boolean {
  return normalizePlanPrice(plan.price_yearly) > 0;
}

export function resolvePlanDisplayPrice(
  plan: { price_monthly: number; price_yearly?: number | null },
  period: BillingPeriod
): { price: number; period: BillingPeriod; fallbackFromYearly: boolean } {
  if (period === 'yearly' && planHasYearlyPrice(plan)) {
    return { price: normalizePlanPrice(plan.price_yearly!), period: 'yearly', fallbackFromYearly: false };
  }
  return {
    price: normalizePlanPrice(plan.price_monthly),
    period: 'monthly',
    fallbackFromYearly: period === 'yearly',
  };
}

/**
 * Admin fiyat alanı — TR formatını destekler:
 * 300 | 300,5 | 3.000 | 3.000,50 | 300.50
 */
export function parsePlanPriceInput(raw: string): number {
  const trimmed = raw.trim().replace(/\s/g, '');
  if (!trimmed) return NaN;

  const hasComma = trimmed.includes(',');
  const hasDot = trimmed.includes('.');

  if (hasComma && hasDot) {
    return Number(trimmed.replace(/\./g, '').replace(',', '.'));
  }
  if (hasComma) {
    return Number(trimmed.replace(',', '.'));
  }
  if (hasDot) {
    const parts = trimmed.split('.');
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
      return Number(trimmed);
    }
    return Number(trimmed.replace(/\./g, ''));
  }
  return Number(trimmed);
}

function currencyFormatLocale(currency: string): string {
  switch (currency.toUpperCase()) {
    case 'TRY':
      return 'tr-TR';
    case 'EUR':
      return 'de-DE';
    default:
      return 'en-US';
  }
}

export function formatPlanPrice(
  price: number,
  currency: string,
  locale?: string
): string {
  const code = (currency || 'TRY').toUpperCase();
  const num = normalizePlanPrice(price);
  const isWhole = Number.isFinite(num) && Math.abs(num % 1) < 1e-9;
  const formatLocale = locale?.trim() || currencyFormatLocale(code);

  try {
    return new Intl.NumberFormat(formatLocale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: isWhole ? 0 : 2,
      maximumFractionDigits: isWhole ? 0 : 2,
    }).format(num);
  } catch {
    return `${code} ${num.toLocaleString(formatLocale)}`;
  }
}

export function normalizePlanFeatureText(text: string, language?: string): string {
  if (isEnglishLanguage(language)) {
    return text
      .replace(/\bmesaj\s*hakk[ıi]/gi, 'AI conversation quota')
      .replace(/\bmesaj\s*limiti/gi, 'AI conversation limit')
      .replace(/\b(\d[\d.,]*)\s*mesaj\b/gi, '$1 AI conversations')
      .replace(/\bsınırsız\s*mesaj\b/gi, 'Unlimited AI conversations');
  }

  return text
    .replace(/\bmesaj\s*hakk[ıi]/gi, 'AI görüşme hakkı')
    .replace(/\bmesaj\s*limiti/gi, 'AI görüşme limiti')
    .replace(/\b(\d[\d.,]*)\s*mesaj\b/gi, '$1 AI görüşme')
    .replace(/\bsınırsız\s*mesaj\b/gi, 'Sınırsız AI görüşme')
    .replace(/\bunlimited\s*messages?\b/gi, 'Unlimited AI conversations');
}

export function parseLegacyDescriptionFeatures(description: string, language?: string): string[] {
  const cleaned = description.trim();
  if (!cleaned) return [];

  let items: string[] = [];
  if (/✅|✓|•/.test(cleaned)) {
    items = cleaned
      .split(/(?:✅|✓)\s*/)
      .map((line) => line.replace(/^[•\-–—\s]+/, '').trim())
      .filter(Boolean);
  } else if (cleaned.includes('\n')) {
    items = cleaned
      .split('\n')
      .map((line) => line.replace(/^[•\-–—✓✅\s]+/, '').trim())
      .filter(Boolean);
  } else {
    items = [cleaned];
  }

  return items.map((item) => normalizePlanFeatureText(item, language));
}

export function resolvePlanFeatures(
  features: string[] | null | undefined,
  description: string | null | undefined,
  language?: string
): string[] {
  if (features && features.length > 0) {
    return features.map((f) => normalizePlanFeatureText(f.trim(), language)).filter(Boolean);
  }
  if (!description?.trim()) return [];
  return parseLegacyDescriptionFeatures(description, language);
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
