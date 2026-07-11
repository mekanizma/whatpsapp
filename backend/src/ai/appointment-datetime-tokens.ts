/**
 * Table-driven date/time tokens for deterministic multilingual slot parsing (TR + EN)
 */

export const MONTH_TOKENS: Record<string, number> = {
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
};

export const WEEKDAY_TOKENS: Record<string, number> = {
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
};

export const RELATIVE_DATE_TOKENS = {
  today: [/\bbugün\b/i, /\bbugun\b/i, /\btoday\b/i],
  tomorrow: [/\byarın\b/i, /\byarin\b/i, /\btomorrow\b/i, /\bertesi\s+gün\b/i, /\bertesi\s+gun\b/i],
  dayAfterTomorrow: [/\böbür gün\b/i, /\bobur\s+gün\b/i, /\bobur\s+gun\b/i, /\bday after tomorrow\b/i],
  nextWeek: [/\bgelecek\s+hafta\b/i, /\bnext\s+week\b/i],
} as const;

export const DAYS_LATER_RE = /\b(\d{1,3})\s*(?:gün\s*sonra|gun\s*sonra|days?\s*later)\b/i;

export const NEXT_WEEKDAY_RE =
  /\b(?:next|gelecek)\s+(pazartesi|pazar|salı|sali|çarşamba|carsamba|perşembe|persembe|cuma|cumartesi|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i;

export const MONTH_NAME_PATTERN = Object.keys(MONTH_TOKENS).join('|');

export const AM_TOKENS = /\b(sabah|gece|öğleden önce|ogleden once|am)\b/i;
export const PM_TOKENS = /\b(öğleden sonra|ogleden sonra|pm|afternoon|evening)\b/i;

export function escapeRegexToken(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let cachedIntentPattern: RegExp | null = null;

export function buildDateTimeIntentPattern(): RegExp {
  if (cachedIntentPattern) return cachedIntentPattern;

  const parts = [
    'yarın|yarin|tomorrow|today|bugün|bugun|ertesi\\s+gün|ertesi\\s+gun',
    '\\d{1,3}\\s*(gün\\s*sonra|gun\\s*sonra|days?\\s*later)',
    'saat\\s*\\d|at\\s+\\d',
    ...Object.keys(WEEKDAY_TOKENS).map(escapeRegexToken),
    '\\d{1,2}[:.]\\d{2}',
    `\\d{1,2}\\s+(${MONTH_NAME_PATTERN})`,
    `(${MONTH_NAME_PATTERN})\\s+\\d{1,2}`,
    '\\d{1,2}\\s*(am|pm)',
    'next\\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)',
    'next\\s+(mon|tue|wed|thu|fri|sat|sun)',
  ];

  cachedIntentPattern = new RegExp(parts.join('|'), 'i');
  return cachedIntentPattern;
}

export function hasDateTimeIntent(message: string): boolean {
  return buildDateTimeIntentPattern().test(message);
}

export function weekdayInText(text: string): number | null {
  const lower = text.toLocaleLowerCase('tr');
  for (const [name, wd] of Object.entries(WEEKDAY_TOKENS)) {
    if (new RegExp(`\\b${escapeRegexToken(name)}\\b`, 'i').test(lower)) return wd;
  }
  return null;
}
