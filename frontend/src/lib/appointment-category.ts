/**
 * Randevu sağlayıcı alanı — işletme kategorisine göre (takvim UI)
 */

export type CompanyCategory =
  | 'universite' | 'klinik' | 'dis_hekimi' | 'guzellik_merkezi'
  | 'emlak' | 'rent_a_car' | 'otel' | 'restoran' | 'kurs' | 'diger';

const MEDICAL_CATEGORIES: CompanyCategory[] = ['klinik', 'dis_hekimi'];

export function shouldAskAppointmentProvider(category?: string | null): boolean {
  if (!category) return false;
  return MEDICAL_CATEGORIES.includes(category as CompanyCategory);
}

export function getCalendarProviderLabelKey(category?: string | null): string | null {
  if (!shouldAskAppointmentProvider(category)) return null;
  return category === 'dis_hekimi' ? 'calendar.dentist' : 'calendar.doctor';
}

const GENERIC_TITLES = new Set(['randevu', 'appointment', 'rezervasyon', 'reservation']);

export function resolveAppointmentDisplayTitle(appointment: {
  title?: string | null;
  notes?: string | null;
}): string {
  const title = appointment.title?.trim() || '';
  const notes = appointment.notes?.trim() || '';
  if (isGenericAppointmentTitle(title) && notes) return notes;
  return title;
}

export function isGenericAppointmentTitle(title?: string | null): boolean {
  const trimmed = title?.trim().toLowerCase() || '';
  return !trimmed || GENERIC_TITLES.has(trimmed);
}
