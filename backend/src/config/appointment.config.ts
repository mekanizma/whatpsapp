/**
 * Randevu akışı yapılandırması — env ile override edilebilir
 */

export type AppointmentMode = 'llm' | 'rules';

export type AppointmentSystemNoteKey =
  | 'INVALID_DATE'
  | 'SLOT_TAKEN'
  | 'SAVED_OK'
  | 'HANDOFF'
  | 'SAVE_FAILED'
  | 'JSON_RETRY';

function parseMode(raw: string | undefined): AppointmentMode {
  const v = (raw || 'llm').trim().toLowerCase();
  return v === 'rules' ? 'rules' : 'llm';
}

function parseIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const appointmentConfig = {
  mode: parseMode(process.env.APPOINTMENT_MODE),
  referenceTimezone: process.env.APPOINTMENT_TIMEZONE || 'Asia/Nicosia',
  maxDaysAhead: parseIntEnv('APPOINTMENT_MAX_DAYS_AHEAD', 60),
  maxTurns: parseIntEnv('APPOINTMENT_MAX_TURNS', 12),
  maxValidationFailures: parseIntEnv('APPOINTMENT_MAX_VALIDATION_FAILURES', 2),
  maxSlotTaken: parseIntEnv('APPOINTMENT_MAX_SLOT_TAKEN', 2),
  slotDurationMinutes: parseIntEnv('APPOINTMENT_SLOT_DURATION_MINUTES', 30),
  handoffFallbackMessage:
    process.env.APPOINTMENT_HANDOFF_FALLBACK_MESSAGE ||
    'Randevu talebinizi şu an sistemde tamamlayamıyoruz. Sizi canlı temsilcimize aktarıyorum.',
  systemNotes: {
    INVALID_DATE:
      process.env.APPOINTMENT_NOTE_INVALID_DATE ||
      'Son verilen tarih/saat geçersiz veya geçmişte; müşteriden nazikçe yeni tarih iste.',
    SLOT_TAKEN:
      process.env.APPOINTMENT_NOTE_SLOT_TAKEN ||
      'İstenen tarih/saat dolu; müşteriden alternatif iste, kendin saat ÖNERME.',
    SAVED_OK:
      process.env.APPOINTMENT_NOTE_SAVED_OK ||
      'Randevu veritabanına ONAYLI olarak kaydedildi. Müşteriye randevunun kesinleştiğini ve tarih/saat bilgisini net şekilde söyle. "Talebiniz alındı", "onay için sizinle iletişime geçilecek" veya benzeri ifadeler KULLANMA.',
    HANDOFF:
      process.env.APPOINTMENT_NOTE_HANDOFF ||
      'Randevu akışında teknik sorun oluştu; müşteriyi canlı temsilciye kibarca yönlendir ve mesajın sonuna transfer işaretini ekle.',
    SAVE_FAILED:
      process.env.APPOINTMENT_NOTE_SAVE_FAILED ||
      'Kayıt başarısız, sebep: {reason}; müşteriden düzeltme iste. action alanını "collect" yap.',
    JSON_RETRY:
      process.env.APPOINTMENT_NOTE_JSON_RETRY ||
      'Önceki yanıt geçerli JSON formatında değildi. Yalnızca şemaya uygun JSON döndür; reply ve appointment alanlarını eksiksiz doldur.',
  } satisfies Record<AppointmentSystemNoteKey, string>,
} as const;
