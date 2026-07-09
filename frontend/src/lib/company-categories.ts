/**
 * Şirket sektör kategorileri — backend company_category enum ile senkron
 */

export const COMPANY_CATEGORY_VALUES = [
  'universite',
  'klinik',
  'dis_hekimi',
  'guzellik_merkezi',
  'emlak',
  'rent_a_car',
  'otel',
  'restoran',
  'kurs',
  'teknoloji',
  'e_ticaret',
  'perakende',
  'lojistik',
  'insaat',
  'hukuk',
  'muhasebe',
  'sigorta',
  'veteriner',
  'eczane',
  'spor_salonu',
  'kuafor',
  'otomotiv',
  'temizlik',
  'turizm',
  'danismanlik',
  'diger',
] as const;

export type CompanyCategory = (typeof COMPANY_CATEGORY_VALUES)[number];

export const DEFAULT_COMPANY_CATEGORY: CompanyCategory = 'diger';

export const COMPANY_CATEGORY_I18N_KEY = 'common.categories';

/** Randevuda doktor/hekim tercihi sorulan sektörler */
export const MEDICAL_PROVIDER_CATEGORIES: CompanyCategory[] = ['klinik', 'dis_hekimi'];

const CATEGORY_SET = new Set<string>(COMPANY_CATEGORY_VALUES);

export function isCompanyCategory(value: string | null | undefined): value is CompanyCategory {
  return !!value && CATEGORY_SET.has(value);
}

export function normalizeCompanyCategory(
  value: string | null | undefined,
  fallback: CompanyCategory = DEFAULT_COMPANY_CATEGORY
): CompanyCategory {
  return isCompanyCategory(value) ? value : fallback;
}

export function companyCategoryI18nKey(value: CompanyCategory): string {
  return `${COMPANY_CATEGORY_I18N_KEY}.${value}`;
}
