/**
 * Randevu akışı yapılandırması — env ile override edilebilir
 */

export type AppointmentMode = 'llm' | 'rules';

export type AppointmentSystemNoteKey =
  | 'INVALID_DATE'
  | 'SLOT_TAKEN'
  | 'SAVED_OK'
  | 'HANDOFF'
  | 'NAME_CORRECTION'
  | 'TOPIC_CAPTURED';

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
  /** llm = AI konuşur + kod kaydeder; rules = deterministik workflow */
  mode: parseMode(process.env.APPOINTMENT_MODE),

  /** Tarih placeholder'ları için varsayılan saat dilimi */
  referenceTimezone: process.env.APPOINTMENT_TIMEZONE || 'Asia/Nicosia',

  maxDaysAhead: parseIntEnv('APPOINTMENT_MAX_DAYS_AHEAD', 60),
  maxTurns: parseIntEnv('APPOINTMENT_MAX_TURNS', 12),
  maxValidationFailures: parseIntEnv('APPOINTMENT_MAX_VALIDATION_FAILURES', 2),
  maxSlotTaken: parseIntEnv('APPOINTMENT_MAX_SLOT_TAKEN', 2),
  maxMissingDataBlocks: parseIntEnv('APPOINTMENT_MAX_MISSING_DATA_BLOCKS', 2),

  slotDurationMinutes: parseIntEnv('APPOINTMENT_SLOT_DURATION_MINUTES', 30),

  /** Kod → AI geri bildirim notları (prompt metni değil — sistem notu) */
  systemNotes: {
    INVALID_DATE:
      process.env.APPOINTMENT_NOTE_INVALID_DATE ||
      'Son verilen tarih/saat geçersiz veya geçmişte; müşteriden nazikçe yeni tarih iste.',
    SLOT_TAKEN:
      process.env.APPOINTMENT_NOTE_SLOT_TAKEN ||
      'İstenen tarih/saat dolu; müşteriden alternatif iste, kendin saat ÖNERME.',
    SAVED_OK:
      process.env.APPOINTMENT_NOTE_SAVED_OK ||
      "Randevu talebi sisteme kaydedildi; müşteriye talebin alındığını ve onay için dönüş yapılacağını söyle, 'kesin onaylandı' deme.",
    HANDOFF:
      process.env.APPOINTMENT_NOTE_HANDOFF ||
      'Randevu akışında teknik sorun oluştu; müşteriyi canlı temsilciye kibarca yönlendir ve mesajın sonuna transfer işaretini ekle.',
    NAME_CORRECTION:
      process.env.APPOINTMENT_NOTE_NAME_CORRECTION ||
      'Müşteri adını düzeltti; appointment_data bloğunda müşterinin yazdığı adı AYNEN kullan, otomatik düzeltme veya Türkçe karakter ekleme yapma.',
    TOPIC_CAPTURED:
      process.env.APPOINTMENT_NOTE_TOPIC_CAPTURED ||
      'Son müşteri mesajı bir bilgi sorusu değil, randevu konusu alanının cevabıdır. Konuyu kaydet; bilgi bankası eksikliği veya temsilci aktarımı teklif etmeden sıradaki eksik randevu bilgisini iste.',
  } satisfies Record<AppointmentSystemNoteKey, string>,
} as const;
