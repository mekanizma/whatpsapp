/**
 * Şirket sektör kategorileri — PostgreSQL company_category enum ile senkron
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

/** Randevuda doktor/hekim tercihi sorulan sektörler */
export const MEDICAL_PROVIDER_CATEGORIES: CompanyCategory[] = ['klinik', 'dis_hekimi'];

const CATEGORY_SET = new Set<string>(COMPANY_CATEGORY_VALUES);

export function isCompanyCategory(value: string): value is CompanyCategory {
  return CATEGORY_SET.has(value);
}

export function validateCompanyCategoryForWrite(
  value: unknown
): { ok: true; category: CompanyCategory } | { ok: false; error: string } {
  if (value === undefined || value === null || value === '') {
    return { ok: false, error: 'Kategori gerekli' };
  }
  const normalized = String(value).trim();
  if (!isCompanyCategory(normalized)) {
    return { ok: false, error: 'Geçersiz şirket kategorisi' };
  }
  return { ok: true, category: normalized };
}

const LABELS_TR: Record<CompanyCategory, string> = {
  universite: 'Üniversite & Eğitim',
  klinik: 'Klinik & Sağlık',
  dis_hekimi: 'Diş Hekimi',
  guzellik_merkezi: 'Güzellik Merkezi',
  emlak: 'Emlak',
  rent_a_car: 'Rent a Car',
  otel: 'Otel & Konaklama',
  restoran: 'Kafe & Restoran',
  kurs: 'Kurs & Dershane',
  teknoloji: 'Teknoloji & Yazılım',
  e_ticaret: 'E-Ticaret',
  perakende: 'Perakende & Mağaza',
  lojistik: 'Lojistik & Kargo',
  insaat: 'İnşaat & Müteahhit',
  hukuk: 'Hukuk & Danışmanlık',
  muhasebe: 'Muhasebe & Finans',
  sigorta: 'Sigorta',
  veteriner: 'Veteriner',
  eczane: 'Eczane',
  spor_salonu: 'Spor & Fitness',
  kuafor: 'Kuaför & Berber',
  otomotiv: 'Otomotiv & Servis',
  temizlik: 'Temizlik Hizmetleri',
  turizm: 'Turizm & Acente',
  danismanlik: 'Danışmanlık',
  diger: 'Diğer',
};

const LABELS_EN: Record<CompanyCategory, string> = {
  universite: 'University & Education',
  klinik: 'Clinic & Healthcare',
  dis_hekimi: 'Dentist',
  guzellik_merkezi: 'Beauty Center',
  emlak: 'Real Estate',
  rent_a_car: 'Car Rental',
  otel: 'Hotel & Hospitality',
  restoran: 'Cafe & Restaurant',
  kurs: 'Courses & Tutoring',
  teknoloji: 'Technology & Software',
  e_ticaret: 'E-Commerce',
  perakende: 'Retail & Store',
  lojistik: 'Logistics & Shipping',
  insaat: 'Construction',
  hukuk: 'Legal & Consulting',
  muhasebe: 'Accounting & Finance',
  sigorta: 'Insurance',
  veteriner: 'Veterinary',
  eczane: 'Pharmacy',
  spor_salonu: 'Sports & Fitness',
  kuafor: 'Hair Salon & Barber',
  otomotiv: 'Automotive & Service',
  temizlik: 'Cleaning Services',
  turizm: 'Tourism & Travel Agency',
  danismanlik: 'Consulting',
  diger: 'Other',
};

export function getCompanyCategoryLabel(
  category: string | null | undefined,
  lang: 'tr' | 'en' = 'tr'
): string {
  if (!category || !isCompanyCategory(category)) return category || '';
  const labels = lang === 'en' ? LABELS_EN : LABELS_TR;
  return labels[category];
}

export function companyCategoryLabelsRecord(lang: 'tr' | 'en' = 'tr'): Record<string, string> {
  const labels = lang === 'en' ? LABELS_EN : LABELS_TR;
  return { ...labels };
}
