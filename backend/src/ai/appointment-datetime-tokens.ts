/**
 * Table-driven date/time tokens for deterministic multilingual slot parsing
 */

export const MONTH_TOKENS: Record<string, number> = {
  // Turkish
  ocak: 1,
  şubat: 2,
  subat: 2,
  mart: 3,
  nisan: 4,
  mayıs: 5,
  mayis: 5,
  haziran: 6,
  temmuz: 7,
  ağustos: 8,
  agustos: 8,
  eylül: 9,
  eylul: 9,
  ekim: 10,
  kasım: 11,
  kasim: 11,
  aralık: 12,
  aralik: 12,
  // English
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
  // German
  januar: 1,
  februar: 2,
  märz: 3,
  maerz: 3,
  mai: 5,
  juli: 7,
  oktober: 10,
  dezember: 12,
  // French
  janvier: 1,
  février: 2,
  fevrier: 2,
  avril: 4,
  juin: 6,
  juillet: 7,
  août: 8,
  aout: 8,
  septembre: 9,
  octobre: 10,
  décembre: 12,
  decembre: 12,
  // Spanish
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
  // Russian (transliterated)
  января: 1,
  январь: 1,
  февраля: 2,
  февраль: 2,
  марта: 3,
  март: 3,
  апреля: 4,
  апрель: 4,
  мая: 5,
  май: 5,
  июня: 6,
  июнь: 6,
  июля: 7,
  июль: 7,
  августа: 8,
  август: 8,
  сентября: 9,
  сентябрь: 9,
  октября: 10,
  октябрь: 10,
  ноября: 11,
  ноябрь: 11,
  декабря: 12,
  декабрь: 12,
};

export const WEEKDAY_TOKENS: Record<string, number> = {
  // Turkish
  pazar: 0,
  pazartesi: 1,
  salı: 2,
  sali: 2,
  çarşamba: 3,
  carsamba: 3,
  perşembe: 4,
  persembe: 4,
  cuma: 5,
  cumartesi: 6,
  // Turkish abbreviations (ASCII keyboards)
  pzt: 1,
  sal: 2,
  car: 3,
  per: 4,
  cum: 5,
  cmt: 6,
  paz: 0,
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  // German
  sonntag: 0,
  montag: 1,
  dienstag: 2,
  mittwoch: 3,
  donnerstag: 4,
  freitag: 5,
  samstag: 6,
  // French
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
  // Spanish
  domingo: 0,
  lunes: 1,
  martes: 2,
  miércoles: 3,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sábado: 6,
  sabado: 6,
  // Russian (transliterated)
  воскресенье: 0,
  понедельник: 1,
  вторник: 2,
  среда: 3,
  четверг: 4,
  пятница: 5,
  суббота: 6,
};

export const RELATIVE_DATE_TOKENS = {
  today: [
    /\bbugün\b/i,
    /\bbugun\b/i,
    /\btoday\b/i,
    /\bheute\b/i,
    /\baujourd'hui\b/i,
    /\bhoy\b/i,
    /\bсегодня\b/i,
    /\bاليوم\b/i,
  ],
  tomorrow: [
    /\byarın\b/i,
    /\byarin\b/i,
    /\btomorrow\b/i,
    /\bertesi\s+gün\b/i,
    /\bertesi\s+gun\b/i,
    /\bmorgen\b/i,
    /\bdemain\b/i,
    /\bmañana\b/i,
    /\bmanana\b/i,
    /\bзавтра\b/i,
    /\bغدا\b/i,
    /\bغداً\b/i,
  ],
  dayAfterTomorrow: [
    /\böbür\s*gün\b/i,
    /\böbürgün\b/i,
    /\bobur\s*gün\b/i,
    /\bobur\s*gun\b/i,
    /\boburgun\b/i,
    /\bobergun\b/i,
    /\bday after tomorrow\b/i,
    /\bübermorgen\b/i,
    /\bubermorgen\b/i,
    /\bpasado mañana\b/i,
    /\bpasado manana\b/i,
  ],
  nextWeek: [
    /\bgelecek\s+hafta\b/i,
    /\bgelecek\s+haftaya\b/i,
    /\bhaftaya\b/i,
    /\bnext\s+week\b/i,
    /\bnächste\s+woche\b/i,
    /\bnaechste\s+woche\b/i,
    /\bsemaine\s+prochaine\b/i,
    /\bpróxima\s+semana\b/i,
    /\bproxima\s+semana\b/i,
  ],
} as const;

export const WEEKS_LATER_RE =
  /\b(\d{1,2})\s*hafta\s*sonra\b/i;

export const MONTHS_LATER_RE =
  /\b(\d{1,2})\s*ay\s*sonra\b/i;

export const DAYS_LATER_RE =
  /\b(\d{1,3})\s*(?:gün\s*sonra|gun\s*sonra|days?\s*later|tage?\s*später|tage?\s*spaeter|jours?\s*plus\s*tard|días?\s*después|dias?\s*despues)\b/i;

/** WhatsApp yazımı: Türkçe karakter olmadan gönderilen tarih ifadelerini normalize et */
export function normalizeAppointmentDateText(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .replace(/öbürgün|öbür\s*gün|oburgun|obergun|obur\s*gün|obur\s*gun/g, 'öbür gün')
    .replace(/gelecek\s*haftaya/g, 'gelecek hafta')
    .replace(/\bhaftaya\b/g, 'gelecek hafta')
    .replace(/ertesi\s*gun/g, 'ertesi gün')
    .replace(/bugun/g, 'bugün')
    .replace(/yarin/g, 'yarın')
    .replace(/carsamba/g, 'çarşamba')
    .replace(/persembe/g, 'perşembe')
    .replace(/\bsali\b/g, 'salı')
    .replace(/mayis/g, 'mayıs')
    .replace(/agustos/g, 'ağustos')
    .replace(/eylul/g, 'eylül')
    .replace(/kasim/g, 'kasım')
    .replace(/aralik/g, 'aralık')
    .replace(/subat/g, 'şubat');
}

export function escapeRegexToken(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const MONTH_NAME_PATTERN = Object.keys(MONTH_TOKENS)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegexToken)
  .join('|');

export const NEXT_WEEKDAY_RE =
  /\b(?:next|gelecek|nächsten?|naechsten?|nächste|naechste|prochain|prochaine|próximo|proximo)\s+(pazartesi|pazar|salı|sali|çarşamba|carsamba|perşembe|persembe|cuma|cumartesi|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|воскресенье)\b/iu;

export const AM_TOKENS = /\b(sabah|gece|öğleden önce|ogleden once|am|morgens|matin|mañana|manana|утра|утром)\b/i;
export const PM_TOKENS = /\b(öğleden sonra|ogleden sonra|pm|afternoon|evening|nachmittags|après-midi|apres-midi|soir|tarde|noche|вечера|вечером|بعد الظهر)\b/i;

/** JS \\b Türkçe harflerde (ı, ş, ğ…) çalışmaz — Unicode harf sınırı */
export function containsWordToken(text: string, token: string): boolean {
  const escaped = escapeRegexToken(token);
  return new RegExp(`(?:^|[^\\p{L}])${escaped}(?:[^\\p{L}]|$)`, 'iu').test(text);
}

let cachedIntentPattern: RegExp | null = null;

export function buildDateTimeIntentPattern(): RegExp {
  if (cachedIntentPattern) return cachedIntentPattern;

  const parts = [
    'yarın|yarin|tomorrow|morgen|demain|mañana|manana|завтра|غدا',
    'öbür\\s*gün|obur\\s*gun|oburgun',
    'bugün|bugun|today|heute|aujourd.hui|hoy|сегодня',
    'ertesi\\s+gün|ertesi\\s+gun',
    'gelecek\\s+hafta|haftaya',
    '\\d{1,3}\\s*(gün\\s*sonra|gun\\s*sonra|days?\\s*later|tage?\\s*später|tage?\\s*spaeter)',
    '\\d{1,2}\\s*hafta\\s*sonra',
    '\\d{1,2}\\s*ay\\s*sonra',
    'saat\\s*\\d|at\\s+\\d|um\\s+\\d|à\\s+\\d|a\\s+las\\s+\\d',
    ...Object.keys(WEEKDAY_TOKENS).map(escapeRegexToken),
    '\\d{1,2}[:.]\\d{2}',
    `\\d{1,2}\\s+(${MONTH_NAME_PATTERN})`,
    `(${MONTH_NAME_PATTERN})\\s+\\d{1,2}`,
    '\\d{1,2}\\s*(am|pm)',
    'next\\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)',
    'next\\s+(mon|tue|wed|thu|fri|sat|sun)',
    'nächsten?\\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)',
    'prochain\\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)',
  ];

  cachedIntentPattern = new RegExp(parts.join('|'), 'iu');
  return cachedIntentPattern;
}

export function hasDateTimeIntent(message: string): boolean {
  return buildDateTimeIntentPattern().test(message);
}

const AVAILABILITY_QUERY_RE =
  /boş\s*saat|bos\s*saat|müsait\s*saat|musait\s*saat|hangi\s*saatler|hangi\s*saat|ne\s*zaman\s*müsait|ne\s*zaman\s*musait|müsait\s*mi|musait\s*mi|müsait\s*misin|musait\s*misin|müsait\s*mi\s*acaba|musait\s*mi\s*acaba|uygun\s*saat|uygun\s*mu|uygunmu|boş\s*mu|bos\s*mu|dolu\s*mu|dolumu|saat\s*var\s*m[ıi]|var\s*m[ıi]\s*boş|var\s*m[ıi]\s*bos|müsaitlik|musaitlik|available\s*times?|available\s*slots?|free\s*times?|free\s*slots?|open\s*slots?|what\s*times?\s*(are\s*)?available|any\s*(free\s*)?(slots?|times?)|which\s*times?\s*(are\s*)?(available|free)|freie\s*termine?|freie\s*zeiten?|verfügbare\s*zeiten?|verfugbare\s*zeiten?|créneaux?\s*disponibles?|creneaux?\s*disponibles?|horarios?\s*(libres?|disponibles?)|quels?\s*horaires?|welche\s*zeiten?|какие\s*времена|свободн\w*\s*слот|свободн\w*\s*время/i;

const WEEKDAY_AVAILABILITY_RE =
  /(?:pazartesi|pazar|salı|sali|çarşamba|carsamba|perşembe|persembe|cuma|cumartesi|pzt|sal|car|per|cum|cmt|paz|yarın|yarin|öbür\s*gün|obur\s*gun|oburgun|gelecek\s*hafta|haftaya).{0,40}(?:müsait|musait|boş|bos|uygun|dolu|saat|randevu)|(?:müsait|musait|boş|bos|uygun|dolu).{0,40}(?:pazartesi|pazar|salı|sali|çarşamba|carsamba|perşembe|persembe|cuma|cumartesi|pzt|sal|car|per|cum|cmt|paz|yarın|yarin|öbür\s*gün|obur\s*gun|oburgun|gelecek\s*hafta|haftaya)/i;

/** Müşteri belirli bir gün için müsait saat listesi soruyor mu */
export function hasAvailabilityQuery(message: string): boolean {
  const normalized = normalizeAppointmentDateText(message);
  return (
    AVAILABILITY_QUERY_RE.test(normalized) || WEEKDAY_AVAILABILITY_RE.test(normalized)
  );
}

export function weekdayInText(text: string): number | null {
  const normalized = normalizeAppointmentDateText(text);
  const variants = [normalized, text.toLocaleLowerCase('tr'), text.toLocaleLowerCase('en')];
  const sorted = Object.entries(WEEKDAY_TOKENS).sort((a, b) => b[0].length - a[0].length);
  for (const lower of variants) {
    for (const [name, wd] of sorted) {
      if (containsWordToken(lower, name)) return wd;
    }
  }
  return null;
}
