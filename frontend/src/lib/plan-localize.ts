/**
 * Abonelik paketi metinlerini seçili dile göre çözümler.
 * DB kaynağı korunur; metinler çevrilir.
 */

import i18n from '@/i18n';
import { PLAN_DESCRIPTION_TR_TO_EN, PLAN_FEATURE_TR_TO_EN } from '@/lib/plan-translations';

const FEATURE_MAP_IGNORE_CASE = new Map(
  Object.entries(PLAN_FEATURE_TR_TO_EN).map(([key, value]) => [key.toLocaleLowerCase('tr-TR'), value])
);

export interface LocalizablePlan {
  plan_type: string;
  name: string;
  name_en?: string | null;
  description?: string | null;
  description_en?: string | null;
  features?: string[] | null;
  features_en?: string[] | null;
}

interface PlanCatalogEntry {
  name?: string;
  description?: string;
  features?: string[];
}

export function isEnglishLanguage(language?: string): boolean {
  const lang = (language || i18n.language || 'tr').toLowerCase();
  return lang.startsWith('en');
}

export function resolveLocaleFromLanguage(language?: string): string {
  return isEnglishLanguage(language) ? 'en-US' : 'tr-TR';
}

function planCatalogKey(planType: string): string {
  return planType.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** i18n plan_type anahtarı (e-ticaret → e_ticaret) */
export function resolvePlanI18nKey(planType: string): string {
  // plan-capabilities ile aynı mantık: "E-ticaret (5000...)" → e_ticaret
  const stripped = planType
    .trim()
    .toLowerCase()
    .replace(/\r?\n/g, ' ')
    .replace(/\([^)]*\)/g, ' ');
  if (/e[\s_-]*ticaret|e[\s_-]*commerce|eticaret|ecommerce/i.test(stripped)) {
    return 'e_ticaret';
  }
  if (/^business\b/i.test(stripped.trim())) return 'business';
  if (/^enterprise\b/i.test(stripped.trim())) return 'enterprise';
  if (/^starter\b/i.test(stripped.trim())) return 'starter';

  const key = planCatalogKey(planType);
  const aliases: Record<string, string> = {
    eticaret: 'e_ticaret',
  };
  return aliases[key] || key;
}

function getPlanCatalogEntry(planType: string, language?: string): PlanCatalogEntry | null {
  const key = resolvePlanI18nKey(planType);
  const lng = isEnglishLanguage(language) ? 'en' : 'tr';
  const entry = i18n.t(`pricing.planCatalog.${key}`, {
    lng,
    returnObjects: true,
    defaultValue: null,
  });

  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  if (!('name' in entry) && !('description' in entry) && !('features' in entry)) return null;
  return entry as PlanCatalogEntry;
}

function normalizeTextKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function formatCountForEnglish(raw: string): string {
  const num = Number(String(raw).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(num) ? num.toLocaleString('en-US') : raw;
}

const PLAN_NAME_TR_TO_EN: Record<string, string> = {
  'e-ticaret': 'E-Commerce',
  e_ticaret: 'E-Commerce',
  eticaret: 'E-Commerce',
};

const FEATURE_REGEX_TR_TO_EN: Array<[RegExp, string | ((match: RegExpMatchArray) => string)]> = [
  [/^sınırsız\s+ai\s+görüşme$/i, 'Unlimited AI conversations'],
  [/^sınırsız\s+kullanıcı$/i, 'Unlimited users'],
  [/^sınırsız\s+mesaj$/i, 'Unlimited AI conversations'],
  [/^ayda\s+(\d[\d.,]*)\s*ai\s+görüşmesi$/i, (m) => `${formatCountForEnglish(m[1])} AI conversations / month`],
  [
    /^(\d[\d.,]*)\s*ai\s+görüşme(\s*\/\s*ay)?$/i,
    (m) => {
      const formatted = formatCountForEnglish(m[1]);
      return m[2] ? `${formatted} AI conversations / month` : `${formatted} AI conversations`;
    },
  ],
  [
    /^(\d[\d.,]*)\s*whatsapp\s+(hattı|numarası|hatları)$/i,
    (m) => {
      const n = Number(String(m[1]).replace(/\./g, '').replace(',', '.'));
      const label = Number.isFinite(n) && n === 1 ? 'WhatsApp line' : 'WhatsApp lines';
      return `${formatCountForEnglish(m[1])} ${label}`;
    },
  ],
  [
    /^(\d[\d.,]*)\s*personel\s+hesabı$/i,
    (m) => {
      const n = Number(String(m[1]).replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(n) && n === 1 ? '1 staff account' : `${formatCountForEnglish(m[1])} staff accounts`;
    },
  ],
  [
    /^(\d[\d.,]*)\s*kullanıcı$/i,
    (m) => {
      const n = Number(String(m[1]).replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(n) && n === 1 ? '1 user' : `${formatCountForEnglish(m[1])} users`;
    },
  ],
  [/^kurulum:\s*\$?([\d.,]+)\s*\(?tek\s*sefer\)?$/i, (m) => `Setup: $${m[1]} (one-time)`],
  [/^kurulum:\s*\$?([\d.,]+)\s*\(tek\s*sefer\)$/i, (m) => `Setup: $${m[1]} (one-time)`],
  [/^web\s+panel\s+erişimi\s+ek:\s*kurulum:\s*\$?([\d.,]+)\s*tek\s*sefer$/i, (m) => `Web dashboard access | Setup: $${m[1]} one-time`],
  [/meta\s+şirket\s+onayı\s+gerekli/i, '(Meta Business Verification required)'],
];

function translateDescriptionToEnglish(text: string): string {
  const key = normalizeTextKey(text);
  if (PLAN_DESCRIPTION_TR_TO_EN[key]) return PLAN_DESCRIPTION_TR_TO_EN[key];
  return key;
}

function lookupFeatureTranslation(key: string): string | undefined {
  return PLAN_FEATURE_TR_TO_EN[key] ?? FEATURE_MAP_IGNORE_CASE.get(key.toLocaleLowerCase('tr-TR'));
}

function translateFeatureToEnglish(text: string): string {
  const key = normalizeTextKey(text);
  const exact = lookupFeatureTranslation(key);
  if (exact) return exact;

  for (const [pattern, replacement] of FEATURE_REGEX_TR_TO_EN) {
    const match = key.match(pattern);
    if (match) {
      return typeof replacement === 'function' ? replacement(match) : replacement;
    }
  }

  // Karma TR+EN satırlar (örn. "20 WhatsApp hattı Meta Şirket Onayı Gerekli")
  if (/şirket\s+onayı\s+gerekli/i.test(key) && /whatsapp\s+hatt/i.test(key)) {
    const countMatch = key.match(/(\d[\d.,]*)/);
    const count = countMatch ? formatCountForEnglish(countMatch[1]) : '';
    return count
      ? `${count} WhatsApp lines (Meta Business Verification required)`
      : 'WhatsApp lines (Meta Business Verification required)';
  }

  return key;
}

function translateNameToEnglish(plan: LocalizablePlan): string {
  const key = planCatalogKey(plan.name);
  if (PLAN_NAME_TR_TO_EN[key]) return PLAN_NAME_TR_TO_EN[key];
  if (PLAN_NAME_TR_TO_EN[planCatalogKey(plan.plan_type)]) {
    return PLAN_NAME_TR_TO_EN[planCatalogKey(plan.plan_type)];
  }
  return plan.name;
}

function resolveLocalizedFeatures(
  plan: LocalizablePlan,
  catalog: PlanCatalogEntry | null,
  language?: string
): string[] | null | undefined {
  if (plan.features && plan.features.length > 0) {
    return isEnglishLanguage(language)
      ? plan.features.map(translateFeatureToEnglish)
      : plan.features;
  }

  if (catalog?.features && catalog.features.length > 0) {
    return catalog.features;
  }

  return plan.features;
}

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

/** Paket rozeti — common.plans veya dinamik kota metni */
export function resolvePlanBadgeLabel(
  plan: {
    plan_type: string;
    message_limit: number;
    name?: string;
    name_en?: string | null;
  },
  t: TranslateFn,
  locale: string,
  language?: string
): string {
  const key = resolvePlanI18nKey(plan.plan_type);
  const i18nKey = `common.plans.${key}`;
  const lng = isEnglishLanguage(language) ? 'en' : 'tr';
  const i18nLabel = t(i18nKey, { defaultValue: '', lng });
  const hasI18nLabel = Boolean(i18nLabel) && i18nLabel !== i18nKey && i18nLabel !== key;

  if (hasI18nLabel) return i18nLabel;

  const displayName = isEnglishLanguage(language)
    ? plan.name_en?.trim() ||
      translateNameToEnglish({ plan_type: plan.plan_type, name: plan.name || key })
    : plan.name || key;

  const quotaLabel =
    plan.message_limit >= 999999
      ? t('subscription.unlimitedMessages')
      : t('subscription.messages', {
          count: plan.message_limit.toLocaleString(locale),
        });

  return `${displayName} (${quotaLabel})`;
}

/** Paket adı, açıklama ve özellikleri seçili dile göre döndürür. */
export function localizePlan<T extends LocalizablePlan>(plan: T, language?: string): T {
  if (!isEnglishLanguage(language)) return plan;

  const catalog = getPlanCatalogEntry(plan.plan_type, language);
  const hasStoredEnglish =
    !!plan.name_en?.trim() ||
    !!plan.description_en?.trim() ||
    (plan.features_en != null && plan.features_en.length > 0);

  if (hasStoredEnglish) {
    return {
      ...plan,
      name: plan.name_en?.trim() || catalog?.name || translateNameToEnglish(plan),
      description: plan.description_en ?? catalog?.description ?? plan.description,
      features:
        plan.features_en && plan.features_en.length > 0
          ? plan.features_en
          : resolveLocalizedFeatures(plan, catalog, language) ?? plan.features,
    };
  }

  const isEn = isEnglishLanguage(language);
  return {
    ...plan,
    name: catalog?.name || translateNameToEnglish(plan),
    description: plan.description
      ? translateDescriptionToEnglish(plan.description)
      : catalog?.description ?? plan.description,
    features: resolveLocalizedFeatures(plan, catalog, language) ?? plan.features,
  };
}
