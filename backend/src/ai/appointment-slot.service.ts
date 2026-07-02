/**
 * Konuşmadan teklif edilen randevu saatini çıkarır (TR, Europe/Istanbul)
 */

import { HistoryMsg } from './appointment-collect.service';
import { ConversationLang, localeForLang } from './language.service';

export const CLINIC_TZ = 'Europe/Istanbul';
export const TR_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface ParsedSlot {
  starts_at: string;
  ends_at: string;
}

const TR_MONTHS: Record<string, number> = {
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
};

const TR_WEEKDAYS: Record<string, number> = {
  pazartesi: 1,
  salı: 2,
  sali: 2,
  çarşamba: 3,
  carsamba: 3,
  perşembe: 4,
  persembe: 4,
  cuma: 5,
  cumartesi: 6,
  pazar: 0,
};

const TR_WEEKDAY_NAMES = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi'];

export function weekdayInText(text: string): number | null {
  const lower = text.toLocaleLowerCase('tr');
  for (const [name, wd] of Object.entries(TR_WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(lower)) return wd;
  }
  return null;
}

export function slotWeekday(startsAt: string): number {
  const parts = turkeyDateParts(new Date(startsAt));
  return turkeyLocalToUtc(parts.year, parts.month, parts.day, 12, 0).getUTCDay();
}

export interface WorkingHoursResult {
  valid: boolean;
  reason?: string;
}

/** Klinik çalışma saatleri: Pzt–Cum 09–18, Cmt 09–14, Paz kapalı, öğle 12:30–13:30 kapalı */
export function validateSlotWorkingHours(slot: ParsedSlot): WorkingHoursResult {
  const start = new Date(slot.starts_at);
  const end = new Date(slot.ends_at);
  const wd = slotWeekday(slot.starts_at);
  const { hour: sh, minute: sm } = turkeyTimeParts(start);
  const { hour: eh } = turkeyTimeParts(end);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + turkeyTimeParts(end).minute;

  if (wd === 0) {
    return { valid: false, reason: 'Pazar günleri randevu alınamaz.' };
  }

  const dayEnd = wd === 6 ? 14 * 60 : 18 * 60;
  const dayStart = 9 * 60;
  if (startMin < dayStart || endMin > dayEnd) {
    return {
      valid: false,
      reason:
        wd === 6
          ? 'Cumartesi randevuları 09:00–14:00 arasındadır.'
          : 'Hafta içi randevular 09:00–18:00 arasındadır.',
    };
  }

  const lunchStart = 12 * 60 + 30;
  const lunchEnd = 13 * 60 + 30;
  if (startMin < lunchEnd && endMin > lunchStart) {
    return { valid: false, reason: '12:30–13:30 öğle arası randevu verilmemektedir.' };
  }

  return { valid: true };
}

const CONFIRM_ONLY_RE =
  /^(evet|onayl?[iıİI]yorum|onaylıyorum|onayliyorum|onay|tamam|uygun|olur|kabul|ok|yes|[123])\s*$/iu;

function isConfirmationOnlyMessage(message: string): boolean {
  return CONFIRM_ONLY_RE.test(message.trim());
}

const MONTH_NAME_RE =
  /(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)/i;

export function turkeyDateParts(ref: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = fmt.format(ref).split('-').map(Number);
  return { year, month, day };
}

export function turkeyTimeParts(ref: Date): { hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [hour, minute] = fmt.format(ref).split(':').map(Number);
  return { hour, minute };
}

export function turkeyLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0) - TR_OFFSET_MS);
}

function addDays(parts: { year: number; month: number; day: number }, days: number) {
  const d = turkeyLocalToUtc(parts.year, parts.month, parts.day, 12, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return turkeyDateParts(d);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function normalizeYear(year: number, refYear: number): number {
  if (year < 100) return 2000 + year;
  return year;
}

function rolloverPastDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  ref: Date
): { year: number; month: number; day: number } {
  let y = year;
  let m = month;
  let d = day;
  const start = turkeyLocalToUtc(y, m, d, hour, minute);
  if (start.getTime() >= ref.getTime() - 60_000) {
    return { year: y, month: m, day: d };
  }
  // Aynı yıl içinde geçmişse bir sonraki yıla al (ör. aralıkta "5 ocak")
  if (m < turkeyDateParts(ref).month || (m === turkeyDateParts(ref).month && d < turkeyDateParts(ref).day)) {
    y += 1;
  } else {
    y += 1;
  }
  return { year: y, month: m, day: d };
}

const OFFER_CONTEXT_RE =
  /onaylıyor|onayliyor|uygun|müsait|musait|alabilirsiniz|öneriyorum|oneriyorum|randevu.*saat|saat.*randevu|teyit|onaylıyor musunuz|onayliyor musunuz/i;

function normalizeSpokenHour(hour: number, text: string): number {
  const lower = text.toLocaleLowerCase('tr');
  if (/\b(sabah|gece|öğleden önce|ogleden once|am)\b/.test(lower)) return hour;
  if (hour >= 13) return hour;
  if (hour >= 8 && hour <= 12) return hour;
  // Konuşma dili: "saat 3" → 15:00
  if (hour >= 1 && hour <= 7) return hour + 12;
  return hour;
}

function extractTimeFromText(text: string): { hour: number; minute: number } | null {
  let hour: number | null = null;
  let minute = 0;

  const saatFull = text.match(/saat\s*(\d{1,2})[:.](\d{2})/i);
  if (saatFull) {
    hour = parseInt(saatFull[1], 10);
    minute = parseInt(saatFull[2], 10);
  } else {
    const saatBare = text.match(/\bsaat\s*(\d{1,2})\b/i);
    if (saatBare) {
      hour = parseInt(saatBare[1], 10);
      minute = 0;
    }
  }

  if (hour === null) {
    const atHour = text.match(/\b(\d{1,2})\s*['']?(de|da|te|ta)\b/i);
    if (atHour) {
      hour = parseInt(atHour[1], 10);
      minute = 0;
    }
  }

  if (hour !== null) {
    hour = normalizeSpokenHour(hour, text);
    if (hour <= 23 && minute <= 59) return { hour, minute };
  }

  const rangeMatch = text.match(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/);
  if (rangeMatch) {
    hour = parseInt(rangeMatch[1], 10);
    minute = parseInt(rangeMatch[2], 10);
    if (hour <= 23 && minute <= 59) return { hour, minute };
  }

  const candidates = [...text.matchAll(/(\d{1,2})[:.](\d{2})/g)];
  for (let i = candidates.length - 1; i >= 0; i--) {
    const m = candidates[i];
    const idx = m.index ?? 0;
    const before = text.slice(Math.max(0, idx - 3), idx);
    const after = text.slice(idx + m[0].length, idx + m[0].length + 5);
    if (/^\d{1,2}\.$/.test(before) || /^\.\d{2,4}/.test(after)) continue;
    hour = parseInt(m[1], 10);
    minute = parseInt(m[2], 10);
    if (hour <= 23 && minute <= 59) return { hour, minute };
  }

  return null;
}

function stripTimeFromText(text: string): string {
  return text
    .replace(/\d{1,2}[:.]\d{2}(?:\s*[-–]\s*\d{1,2}[:.]\d{2})?/g, ' ')
    .replace(/\bsaat\s*\d{1,2}(?:[:.]\d{2})?\b/gi, ' ')
    .replace(/\b\d{1,2}\s*['']?(de|da|te|ta)\b/gi, ' ');
}

function extractDateParts(
  text: string,
  ref: Date
): { year: number; month: number; day: number } | null {
  const dateText = stripTimeFromText(text);
  const lower = dateText.toLocaleLowerCase('tr');
  const trNow = turkeyDateParts(ref);
  let { year, month, day } = trNow;

  if (/\bgelecek\s+hafta\b/.test(lower)) {
    ({ year, month, day } = addDays(trNow, 7));
  }

  if (/\byarın\b|\byarin\b/.test(lower)) {
    return addDays(trNow, 1);
  }
  if (/\böbür gün\b|\bobur\s+gün\b|\bobur\s+gun\b/.test(lower)) {
    return addDays(trNow, 2);
  }
  if (/\bbugün\b|\bbugun\b/.test(lower)) {
    return trNow;
  }

  for (const [name, weekday] of Object.entries(TR_WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(lower)) {
      const refUtc = turkeyLocalToUtc(trNow.year, trNow.month, trNow.day, 12, 0);
      const currentWd = refUtc.getUTCDay();
      let delta = (weekday - currentWd + 7) % 7;
      if (delta === 0) delta = 7;
      return addDays(trNow, delta);
    }
  }

  const monthDayMatch = dateText.match(
    /(\d{1,2})\s*[,.\s/-]*\s*(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)(?:\s*[,.\s/-]*\s*(\d{2,4}))?/i
  );
  if (monthDayMatch) {
    day = parseInt(monthDayMatch[1], 10);
    month = TR_MONTHS[monthDayMatch[2].toLocaleLowerCase('tr')];
    if (monthDayMatch[3]) year = normalizeYear(parseInt(monthDayMatch[3], 10), trNow.year);
    if (day >= 1 && day <= daysInMonth(year, month)) {
      return { year, month, day };
    }
    return null;
  }

  const dayMonthMatch = dateText.match(
    /(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)\s*[,.\s/-]*\s*(\d{1,2})(?:\s*[,.\s/-]*\s*(\d{2,4}))?/i
  );
  if (dayMonthMatch) {
    month = TR_MONTHS[dayMonthMatch[1].toLocaleLowerCase('tr')];
    day = parseInt(dayMonthMatch[2], 10);
    if (dayMonthMatch[3]) year = normalizeYear(parseInt(dayMonthMatch[3], 10), trNow.year);
    if (day >= 1 && day <= daysInMonth(year, month)) {
      return { year, month, day };
    }
    return null;
  }

  const isoMatch = dateText.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10);
    day = parseInt(isoMatch[3], 10);
    if (day >= 1 && day <= daysInMonth(year, month)) {
      return { year, month, day };
    }
    return null;
  }

  const dateMatch = dateText.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (dateMatch) {
    day = parseInt(dateMatch[1], 10);
    month = parseInt(dateMatch[2], 10);
    if (month < 1 || month > 12) return null;
    const y = dateMatch[3];
    if (y) year = normalizeYear(parseInt(y, 10), trNow.year);
    if (day < 1 || day > daysInMonth(year, month)) return null;
    return { year, month, day };
  }

  if (MONTH_NAME_RE.test(dateText)) return null;

  return null;
}

/** Tek bir metinden tarih/saat çıkar */
export function parseSlotFromTurkishText(text: string, ref = new Date()): ParsedSlot | null {
  const time = extractTimeFromText(text);
  if (!time) return null;
  const { hour, minute } = time;

  const trNow = turkeyDateParts(ref);
  let dateParts = extractDateParts(text, ref);

  if (!dateParts) {
    dateParts = { ...trNow };
    const startToday = turkeyLocalToUtc(trNow.year, trNow.month, trNow.day, hour, minute);
    if (startToday.getTime() <= ref.getTime()) {
      dateParts = addDays(trNow, 1);
    }
  }

  let { year, month, day } = dateParts;
  ({ year, month, day } = rolloverPastDate(year, month, day, hour, minute, ref));

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  const start = turkeyLocalToUtc(year, month, day, hour, minute);
  let end = new Date(start.getTime() + 30 * 60 * 1000);

  const rangeMatch = text.match(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/);
  if (rangeMatch) {
    const eh = parseInt(rangeMatch[3], 10);
    const em = parseInt(rangeMatch[4], 10);
    if (eh <= 23 && em <= 59) {
      end = turkeyLocalToUtc(year, month, day, eh, em);
    }
  }

  if (end.getTime() <= start.getTime()) return null;
  if (start.getTime() < ref.getTime() - 60_000) return null;

  return { starts_at: start.toISOString(), ends_at: end.toISOString() };
}

export function extractNumberedAlternative(
  history: HistoryMsg[],
  latestMessage: string,
  ref = new Date()
): ParsedSlot | null {
  const numMatch = latestMessage.trim().match(/^([123])\s*$/);
  if (!numMatch) return null;
  const n = parseInt(numMatch[1], 10);

  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].sender_type !== 'ai') continue;
    for (const line of history[i].message.split('\n')) {
      const m = line.match(new RegExp(`^${n}\\)\\s*(.+)$`));
      if (m) {
        const slot = parseSlotFromTurkishText(m[1].trim(), ref);
        if (slot) return slot;
      }
    }
  }
  return null;
}

const WORKING_HOURS_INFO_RE =
  /çalışma saat|calisma saat|hafta içi|hafta ici|pazartesi.*cuma|pzt.*cum|öğle.*kapalı|ogle.*kapali|09:00.*18:00/i;

/** Konuşmadan (müşteri + AI) en güncel tarih/saat teklifini bul */
export function extractSlotFromConversation(
  history: HistoryMsg[],
  latestMessage: string,
  ref = new Date()
): ParsedSlot | null {
  const fromNumber = extractNumberedAlternative(history, latestMessage, ref);
  if (fromNumber) return fromNumber;

  const fromLatest = parseSlotFromTurkishText(latestMessage, ref);
  if (fromLatest) return fromLatest;

  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.sender_type !== 'customer') continue;
    const slot = parseSlotFromTurkishText(m.message, ref);
    if (slot) return slot;
  }

  return extractOfferedSlotFromHistory(history, ref);
}

/** Onay öncesi son AI teklifindeki saati bul */
export function extractOfferedSlotFromHistory(
  history: HistoryMsg[],
  ref = new Date()
): ParsedSlot | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.sender_type !== 'ai') continue;
    const text = m.message;
    if (WORKING_HOURS_INFO_RE.test(text) && !OFFER_CONTEXT_RE.test(text)) continue;
    if (!OFFER_CONTEXT_RE.test(text)) continue;
    const slot = parseSlotFromTurkishText(text, ref);
    if (slot) return slot;
  }
  return null;
}

/** Onay anında — müşterinin gün adı/tarih ifadesi AI halüsinasyonundan önceliklidir */
export function extractSlotForConfirmation(
  history: HistoryMsg[],
  latestMessage: string,
  ref = new Date()
): ParsedSlot | null {
  const fromNumber = extractNumberedAlternative(history, latestMessage, ref);
  if (fromNumber) return fromNumber;

  let customerSlot: ParsedSlot | null = null;
  let customerText = '';
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.sender_type !== 'customer') continue;
    const msg = m.message.trim();
    if (isConfirmationOnlyMessage(msg)) continue;
    const slot = parseSlotFromTurkishText(msg, ref);
    if (slot) {
      customerSlot = slot;
      customerText = msg;
      break;
    }
  }

  const aiSlot = extractOfferedSlotFromHistory(history, ref);

  if (customerSlot && aiSlot) {
    const requestedWd = weekdayInText(customerText);
    if (requestedWd !== null) {
      const parsedWd = slotWeekday(customerSlot.starts_at);
      if (parsedWd === requestedWd) return customerSlot;
    }
    if (!slotsRoughlyMatch(customerSlot.starts_at, aiSlot.starts_at, 12 * 60)) {
      if (weekdayInText(customerText) !== null) return customerSlot;
    }
    return customerSlot;
  }

  return customerSlot || aiSlot || parseSlotFromTurkishText(latestMessage, ref);
}

export function formatWeekdayTurkish(startsAt: string): string {
  const wd = slotWeekday(startsAt);
  return TR_WEEKDAY_NAMES[wd] || '';
}

export function buildAppointmentConfirmationPrompt(
  fields: {
    customer_name: string | null;
    customer_phone: string | null;
    title: string | null;
  },
  slot: ParsedSlot,
  lang: ConversationLang = 'tr'
): string {
  const slotLabel = formatSlotLocalized(slot.starts_at, slot.ends_at, lang);
  const weekday = formatWeekdayTurkish(slot.starts_at);
  const weekdayLine = weekday ? ` (${weekday.charAt(0).toUpperCase()}${weekday.slice(1)})` : '';
  const phone = fields.customer_phone || '—';
  let displayPhone = phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) {
    const local = digits.startsWith('90') ? `0${digits.slice(2)}` : digits.startsWith('0') ? digits : `0${digits}`;
    if (local.length === 11) {
      displayPhone = `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7, 9)} ${local.slice(9)}`;
    }
  }

  if (lang === 'tr') {
    return [
      'Randevu özeti:',
      `- Tarih/Saat: ${slotLabel}${weekdayLine}`,
      `- Ad Soyad: ${fields.customer_name || '—'}`,
      `- Konu: ${fields.title || '—'}`,
      `- Telefon: ${displayPhone}`,
      '',
      'Bu bilgileri onaylıyor musunuz?',
    ].join('\n');
  }

  return [
    'Appointment summary:',
    `- Date/Time: ${slotLabel}`,
    `- Name: ${fields.customer_name || '—'}`,
    `- Service: ${fields.title || '—'}`,
    `- Phone: ${displayPhone}`,
    '',
    'Do you confirm these details?',
  ].join('\n');
}

export function slotsRoughlyMatch(a: string, b: string, toleranceMin = 5): boolean {
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diff <= toleranceMin * 60 * 1000;
}

export function formatSlotTurkish(startsAt: string, endsAt: string): string {
  return formatSlotLocalized(startsAt, endsAt, 'tr');
}

export function formatSlotLocalized(
  startsAt: string,
  endsAt: string,
  lang: ConversationLang = 'tr'
): string {
  const locale = localeForLang(lang);
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const day = start.toLocaleDateString(locale, {
    timeZone: CLINIC_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const t1 = start.toLocaleTimeString(locale, {
    timeZone: CLINIC_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
  const t2 = end.toLocaleTimeString(locale, {
    timeZone: CLINIC_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${day} ${t1}-${t2}`;
}

/** Konuşmadaki teklif, action/LLM saatinden önceliklidir */
export function preferHistorySlot(
  history: HistoryMsg[],
  action: { starts_at?: string; ends_at?: string },
  latestMessage = '',
  ref = new Date()
): { starts_at: string; ends_at: string } | null {
  const offered = extractSlotFromConversation(history, latestMessage, ref);
  if (!offered) {
    if (action.starts_at && action.ends_at) {
      return { starts_at: action.starts_at, ends_at: action.ends_at };
    }
    return null;
  }
  if (action.starts_at && !slotsRoughlyMatch(offered.starts_at, action.starts_at)) {
    console.warn(
      `[Randevu] LLM saati (${action.starts_at}) konuşmadaki teklifle uyuşmuyor — teklif kullanılıyor: ${offered.starts_at}`
    );
  }
  return offered;
}
