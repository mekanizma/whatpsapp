/**
 * Randevu sağlayıcı (doktor/hekim) — işletme kategorisine göre
 */

import type { CompanyCategory } from '../constants/company-categories';
import { MEDICAL_PROVIDER_CATEGORIES } from '../constants/company-categories';
import type { ConversationLang } from '../ai/language.service';

export function shouldAskAppointmentProvider(category?: string | null): boolean {
  if (!category) return false;
  return MEDICAL_PROVIDER_CATEGORIES.includes(category as CompanyCategory);
}

const PROVIDER_LABELS: Record<
  'doctor' | 'dentist',
  Record<'tr' | 'en' | 'de' | 'ar' | 'ru' | 'fr' | 'es', string>
> = {
  doctor: {
    tr: 'Doktor',
    en: 'Doctor',
    de: 'Arzt',
    ar: 'الطبيب',
    ru: 'Врач',
    fr: 'Médecin',
    es: 'Médico',
  },
  dentist: {
    tr: 'Diş hekimi',
    en: 'Dentist',
    de: 'Zahnarzt',
    ar: 'طبيب الأسنان',
    ru: 'Стоматолог',
    fr: 'Dentiste',
    es: 'Dentista',
  },
};

function templateLang(lang: ConversationLang): keyof typeof PROVIDER_LABELS.doctor {
  return lang === 'other' ? 'en' : lang;
}

export function getAppointmentProviderLabelForCategory(
  lang: ConversationLang,
  category?: string | null
): string {
  if (!shouldAskAppointmentProvider(category)) return '';
  const key = category === 'dis_hekimi' ? 'dentist' : 'doctor';
  return PROVIDER_LABELS[key][templateLang(lang)] || PROVIDER_LABELS[key].en;
}

export function buildAppointmentProviderRule(category?: string | null): string {
  if (shouldAskAppointmentProvider(category)) {
    const kind = category === 'dis_hekimi' ? 'diş hekimi' : 'doktor';
    return (
      `RANDEVU SAĞLAYICI (${category}):\n` +
      `- Müşteriden tercih ettiği ${kind} varsa sor (yoksa geç).\n` +
      `- doctor_name alanına yalnızca ${kind} adı yaz; konu/hizmet özeti title alanında kalmalı.`
    );
  }
  return (
    'RANDEVU SAĞLAYICI (üniversite / genel işletme):\n' +
    '- Doktor, hekim veya personel tercihi SORMA.\n' +
    '- doctor_name / preferred_doctor alanlarını BOŞ bırak.\n' +
    '- Konu ve hizmet özetini yalnızca title alanına yaz.'
  );
}

const GENERIC_TITLES = new Set(['randevu', 'appointment', 'rezervasyon', 'reservation']);

export function isGenericAppointmentTitle(title?: string | null): boolean {
  const trimmed = title?.trim().toLowerCase() || '';
  return !trimmed || GENERIC_TITLES.has(trimmed);
}
