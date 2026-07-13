/**
 * Konuşmadan teklif edilen randevu saatini çıkarır (çok dilli, tenant timezone)
 */

import { HistoryMsg } from './appointment-collect.service';
import { ConversationLang, localeForLang, t } from './language.service';
import {
  buildScheduleSummary,
  formatWeekdayName,
  parseHm,
  weekdayToDayKey,
  type WorkingHoursSchedule,
} from '../services/working-hours.service';
import { DEFAULT_COMPANY_TIMEZONE } from '../services/company-timezone.service';
import {
  type AppointmentCompanyContext,
  DEFAULT_APPOINTMENT_CONTEXT,
} from './appointment-company-context';
import {
  AM_TOKENS,
  MONTH_NAME_PATTERN,
  MONTH_TOKENS,
  NEXT_WEEKDAY_RE,
  PM_TOKENS,
  RELATIVE_DATE_TOKENS,
  WEEKDAY_TOKENS,
  DAYS_LATER_RE,
  WEEKS_LATER_RE,
  MONTHS_LATER_RE,
  normalizeAppointmentDateText,
  weekdayInText,
  hasDateTimeIntent,
} from './appointment-datetime-tokens';

export const DEFAULT_COMPANY_TIMEZONE_EXPORT = DEFAULT_COMPANY_TIMEZONE;
/** @deprecated Use DEFAULT_COMPANY_TIMEZONE or company.timezone */
export const CLINIC_TZ = DEFAULT_COMPANY_TIMEZONE;

export interface ParsedSlot {
  starts_at: string;
  ends_at: string;
}

export interface SlotParseOptions {
  ref?: Date;
  timezone?: string;
  /** YYYY-MM-DD — saat-only listede doğru günü sabitlemek için */
  dateAnchor?: string;
}

function normalizeSlotOptions(refOrOptions: Date | SlotParseOptions = {}): SlotParseOptions {
  return refOrOptions instanceof Date ? { ref: refOrOptions } : refOrOptions;
}

export interface WorkingHoursResult {
  valid: boolean;
  reason?: string;
}

function getTimezone(ctx?: AppointmentCompanyContext, options?: SlotParseOptions): string {
  return options?.timezone || ctx?.timezone || DEFAULT_COMPANY_TIMEZONE;
}

function getTimezoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
}

export function localToUtcInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string = DEFAULT_COMPANY_TIMEZONE
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = getTimezoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
}

/** @deprecated Use localToUtcInTimezone with company timezone */
export function turkeyLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  return localToUtcInTimezone(year, month, day, hour, minute, DEFAULT_COMPANY_TIMEZONE);
}

export function companyDateParts(
  ref: Date,
  timeZone: string = DEFAULT_COMPANY_TIMEZONE
): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = fmt.format(ref).split('-').map(Number);
  return { year, month, day };
}

/** @deprecated Use companyDateParts */
export function turkeyDateParts(ref: Date): { year: number; month: number; day: number } {
  return companyDateParts(ref, DEFAULT_COMPANY_TIMEZONE);
}

export function companyTimeParts(
  ref: Date,
  timeZone: string = DEFAULT_COMPANY_TIMEZONE
): { hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [hour, minute] = fmt.format(ref).split(':').map(Number);
  return { hour, minute };
}

/** @deprecated Use companyTimeParts */
export function turkeyTimeParts(ref: Date): { hour: number; minute: number } {
  return companyTimeParts(ref, DEFAULT_COMPANY_TIMEZONE);
}

export function slotWeekday(startsAt: string, timeZone: string = DEFAULT_COMPANY_TIMEZONE): number {
  const parts = companyDateParts(new Date(startsAt), timeZone);
  return localToUtcInTimezone(parts.year, parts.month, parts.day, 12, 0, timeZone).getUTCDay();
}

export function validateSlotWorkingHours(
  slot: ParsedSlot,
  ctx: AppointmentCompanyContext = DEFAULT_APPOINTMENT_CONTEXT,
  lang: ConversationLang = 'tr'
): WorkingHoursResult {
  const timeZone = ctx.timezone;
  const schedule = ctx.schedule;
  const wd = slotWeekday(slot.starts_at, timeZone);
  const dayKey = weekdayToDayKey(wd);
  const daySchedule = schedule[dayKey];
  const dayName = formatWeekdayName(lang, wd);

  const start = new Date(slot.starts_at);
  const end = new Date(slot.ends_at);
  const { hour: sh, minute: sm } = companyTimeParts(start, timeZone);
  const { hour: eh, minute: em } = companyTimeParts(end, timeZone);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  if (!daySchedule) {
    return {
      valid: false,
      reason: t(lang, 'appointment_day_closed', { day: dayName }),
    };
  }

  const openMin = parseHm(daySchedule.open);
  const closeMin = parseHm(daySchedule.close);

  if (startMin < openMin || endMin > closeMin) {
    return {
      valid: false,
      reason: t(lang, 'appointment_hours_outside', {
        day: dayName,
        open: daySchedule.open,
        close: daySchedule.close,
      }),
    };
  }

  for (const br of daySchedule.breaks || []) {
    const breakStart = parseHm(br.start);
    const breakEnd = parseHm(br.end);
    if (startMin < breakEnd && endMin > breakStart) {
      return {
        valid: false,
        reason: t(lang, 'appointment_break_unavailable', {
          breakStart: br.start,
          breakEnd: br.end,
        }),
      };
    }
  }

  return { valid: true };
}

export function buildWorkingHoursRejectionMessage(
  result: WorkingHoursResult,
  ctx: AppointmentCompanyContext,
  lang: ConversationLang
): string {
  const summary = buildScheduleSummary(ctx.schedule, lang);
  const hint = t(lang, 'appointment_pick_another_time', { scheduleSummary: summary });
  return `${result.reason || ''} ${hint}`.trim();
}

export { weekdayInText };

const CONFIRM_ONLY_RE =
  /^(evet|onayl?[iıİI]yorum|onaylıyorum|onayliyorum|onay|tamam|uygun|olur|kabul|ok|yes|[123])\s*$/iu;

function isConfirmationOnlyMessage(message: string): boolean {
  return CONFIRM_ONLY_RE.test(message.trim());
}

const MONTH_NAME_RE = new RegExp(MONTH_NAME_PATTERN, 'i');

const OFFER_CONTEXT_RE =
  /onaylıyor|onayliyor|uygun|müsait|musait|alabilirsiniz|öneriyorum|oneriyorum|randevu.*saat|saat.*randevu|teyit|onaylıyor musunuz|onayliyor musunuz|do you confirm|available at|book.*appointment/i;

export function isWorkingHoursInfoMessage(text: string): boolean {
  return (
    /çalışma saat|calisma saat|working hours|randevuları .* arasındadır|appointments are .* between|appointments are not available|randevu verilmemektedir|lunch break|öğle.*kapalı|ogle.*kapali|choose another time within working hours|çalışma saatleri içinde başka bir saat/i.test(
      text
    ) || /\d{2}:\d{2}[–-]\d{2}:\d{2}/.test(text)
  );
}

function addDays(
  parts: { year: number; month: number; day: number },
  days: number,
  timeZone: string
) {
  const d = localToUtcInTimezone(parts.year, parts.month, parts.day, 12, 0, timeZone);
  d.setUTCDate(d.getUTCDate() + days);
  return companyDateParts(d, timeZone);
}

function addMonths(
  parts: { year: number; month: number; day: number },
  months: number,
  timeZone: string
): { year: number; month: number; day: number } {
  let month = parts.month + months;
  let year = parts.year;
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  const day = Math.min(parts.day, daysInMonth(year, month));
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function normalizeYear(year: number): number {
  if (year < 100) return 2000 + year;
  return year;
}

function rolloverPastDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  ref: Date,
  timeZone: string
): { year: number; month: number; day: number } {
  let y = year;
  const m = month;
  const d = day;
  const start = localToUtcInTimezone(y, m, d, hour, minute, timeZone);
  if (start.getTime() >= ref.getTime() - 60_000) {
    return { year: y, month: m, day: d };
  }
  const refParts = companyDateParts(ref, timeZone);
  if (m < refParts.month || (m === refParts.month && d < refParts.day)) {
    y += 1;
  } else {
    y += 1;
  }
  return { year: y, month: m, day: d };
}

function normalizeSpokenHour(hour: number, text: string): number {
  const lower = text.toLocaleLowerCase('tr');
  if (AM_TOKENS.test(lower)) return hour === 12 ? 0 : hour;
  if (PM_TOKENS.test(lower)) return hour < 12 ? hour + 12 : hour;
  if (hour >= 13) return hour;
  if (hour >= 8 && hour <= 12) return hour;
  if (hour >= 1 && hour <= 7) return hour + 12;
  return hour;
}

function extractTimeFromText(text: string): { hour: number; minute: number } | null {
  let hour: number | null = null;
  let minute = 0;

  const ampmMatch = text.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/i);
  if (ampmMatch) {
    hour = parseInt(ampmMatch[1], 10);
    minute = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const ampm = ampmMatch[3].toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    if (hour <= 23 && minute <= 59) return { hour, minute };
  }

  const atTime = text.match(/\bat\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/i);
  if (atTime) {
    hour = parseInt(atTime[1], 10);
    minute = atTime[2] ? parseInt(atTime[2], 10) : 0;
    const ampm = atTime[3]?.toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    else if (!ampm) hour = normalizeSpokenHour(hour, text);
    if (hour <= 23 && minute <= 59) return { hour, minute };
  }

  const saatFull = text.match(/(?:saat|at)\s*(\d{1,2})[:.](\d{2})/i);
  if (saatFull) {
    hour = parseInt(saatFull[1], 10);
    minute = parseInt(saatFull[2], 10);
  } else {
    const saatBare = text.match(/\b(?:saat|at)\s*(\d{1,2})\b/i);
    if (saatBare) {
      hour = parseInt(saatBare[1], 10);
      minute = 0;
    }
  }

  if (hour === null) {
    const hourReply = text.match(/^(\d{1,2})\s+(?:olur|uygun|iyi|olsun|kabul|lütfen|lutfen)\s*$/i);
    if (hourReply) {
      hour = parseInt(hourReply[1], 10);
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
    .replace(/\b(?:saat|at)\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\b/gi, ' ')
    .replace(/\b\d{1,2}\s*['']?(de|da|te|ta)\b/gi, ' ')
    .replace(/\b\d{1,2}(?:[:.]\d{2})?\s*(am|pm)\b/gi, ' ');
}

function resolveNextWeekday(
  weekday: number,
  refParts: { year: number; month: number; day: number },
  timeZone: string,
  forceNext = false
) {
  const refUtc = localToUtcInTimezone(refParts.year, refParts.month, refParts.day, 12, 0, timeZone);
  const currentWd = refUtc.getUTCDay();
  let delta = (weekday - currentWd + 7) % 7;
  if (delta === 0 && forceNext) delta = 7;
  if (delta === 0 && !forceNext) delta = 7;
  return addDays(refParts, delta, timeZone);
}

function extractDateParts(
  text: string,
  ref: Date,
  timeZone: string
): { year: number; month: number; day: number } | null {
  const dateText = stripTimeFromText(text);
  const normalized = normalizeAppointmentDateText(dateText);
  const lower = normalized.toLocaleLowerCase('tr');
  const localNow = companyDateParts(ref, timeZone);
  let { year, month, day } = localNow;

  const nextWd = normalized.match(NEXT_WEEKDAY_RE);
  if (nextWd) {
    const token = nextWd[1].toLocaleLowerCase('tr');
    const weekday = WEEKDAY_TOKENS[token];
    if (weekday !== undefined) {
      return resolveNextWeekday(weekday, localNow, timeZone, true);
    }
  }

  if (RELATIVE_DATE_TOKENS.nextWeek.some((re) => re.test(lower))) {
    return addDays(localNow, 7, timeZone);
  }
  if (RELATIVE_DATE_TOKENS.tomorrow.some((re) => re.test(lower))) {
    return addDays(localNow, 1, timeZone);
  }
  if (
    RELATIVE_DATE_TOKENS.dayAfterTomorrow.some((re) => re.test(lower)) ||
    /öbürgün|öbür\s*gün|oburgun|obur\s*gun|obergun/i.test(lower)
  ) {
    return addDays(localNow, 2, timeZone);
  }
  if (RELATIVE_DATE_TOKENS.today.some((re) => re.test(lower))) {
    return localNow;
  }

  const daysLater = normalized.match(DAYS_LATER_RE);
  if (daysLater) {
    return addDays(localNow, parseInt(daysLater[1], 10), timeZone);
  }

  const weeksLater = normalized.match(WEEKS_LATER_RE);
  if (weeksLater) {
    return addDays(localNow, parseInt(weeksLater[1], 10) * 7, timeZone);
  }

  const monthsLater = normalized.match(MONTHS_LATER_RE);
  if (monthsLater) {
    return addMonths(localNow, parseInt(monthsLater[1], 10), timeZone);
  }

  for (const [name, weekday] of Object.entries(WEEKDAY_TOKENS)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(lower)) {
      return resolveNextWeekday(weekday, localNow, timeZone, /\bnext\b/i.test(lower));
    }
  }

  const monthDayMatch = normalized.match(
    new RegExp(
      `(\\d{1,2})\\s*[,.\s/-]*\\s*(${MONTH_NAME_PATTERN})(?:\\s*[,.\s/-]*\\s*(\\d{2,4}))?`,
      'i'
    )
  );
  if (monthDayMatch) {
    day = parseInt(monthDayMatch[1], 10);
    month = MONTH_TOKENS[monthDayMatch[2].toLocaleLowerCase('tr')];
    if (monthDayMatch[3]) year = normalizeYear(parseInt(monthDayMatch[3], 10));
    if (day >= 1 && day <= daysInMonth(year, month)) {
      return { year, month, day };
    }
    return null;
  }

  const dayMonthMatch = normalized.match(
    new RegExp(
      `(${MONTH_NAME_PATTERN})\\s*[,.\s/-]*\\s*(\\d{1,2})(?:\\s*[,.\s/-]*\\s*(\\d{2,4}))?`,
      'i'
    )
  );
  if (dayMonthMatch) {
    month = MONTH_TOKENS[dayMonthMatch[1].toLocaleLowerCase('tr')];
    day = parseInt(dayMonthMatch[2], 10);
    if (dayMonthMatch[3]) year = normalizeYear(parseInt(dayMonthMatch[3], 10));
    if (day >= 1 && day <= daysInMonth(year, month)) {
      return { year, month, day };
    }
    return null;
  }

  const isoMatch = normalized.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10);
    day = parseInt(isoMatch[3], 10);
    if (day >= 1 && day <= daysInMonth(year, month)) {
      return { year, month, day };
    }
    return null;
  }

  const dateMatch = normalized.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (dateMatch) {
    day = parseInt(dateMatch[1], 10);
    month = parseInt(dateMatch[2], 10);
    if (month < 1 || month > 12) return null;
    const y = dateMatch[3];
    if (y) year = normalizeYear(parseInt(y, 10));
    if (day < 1 || day > daysInMonth(year, month)) return null;
    return { year, month, day };
  }

  if (MONTH_NAME_RE.test(normalized)) return null;

  return null;
}

/** Yalnızca gün referansı (bugün, yarın, pazartesi) — saat olmadan müsaitlik listesi için */
export function parseDateAnchorFromText(
  text: string,
  options: SlotParseOptions = {}
): string | null {
  const ref = options.ref ?? new Date();
  const timeZone = options.timezone ?? DEFAULT_COMPANY_TIMEZONE;
  const parts = extractDateParts(text, ref, timeZone);
  if (!parts) return null;
  return localToUtcInTimezone(parts.year, parts.month, parts.day, 12, 0, timeZone).toISOString();
}

/** Tek bir metinden tarih/saat çıkar (TR + EN) */
export function parseSlotFromText(
  text: string,
  options: SlotParseOptions = {}
): ParsedSlot | null {
  const ref = options.ref ?? new Date();
  const timeZone = options.timezone ?? DEFAULT_COMPANY_TIMEZONE;

  const time = extractTimeFromText(text);
  if (!time) return null;
  const { hour, minute } = time;

  const localNow = companyDateParts(ref, timeZone);
  let dateParts = extractDateParts(text, ref, timeZone);

  if (!dateParts && options.dateAnchor) {
    const iso = options.dateAnchor.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      dateParts = {
        year: parseInt(iso[1], 10),
        month: parseInt(iso[2], 10),
        day: parseInt(iso[3], 10),
      };
    }
  }

  if (!dateParts) {
    dateParts = { ...localNow };
    const startToday = localToUtcInTimezone(localNow.year, localNow.month, localNow.day, hour, minute, timeZone);
    if (startToday.getTime() <= ref.getTime()) {
      dateParts = addDays(localNow, 1, timeZone);
    }
  }

  let { year, month, day } = dateParts;
  ({ year, month, day } = rolloverPastDate(year, month, day, hour, minute, ref, timeZone));

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  const start = localToUtcInTimezone(year, month, day, hour, minute, timeZone);
  let end = new Date(start.getTime() + 30 * 60 * 1000);

  const rangeMatch = text.match(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/);
  if (rangeMatch) {
    const eh = parseInt(rangeMatch[3], 10);
    const em = parseInt(rangeMatch[4], 10);
    if (eh <= 23 && em <= 59) {
      end = localToUtcInTimezone(year, month, day, eh, em, timeZone);
    }
  }

  if (end.getTime() <= start.getTime()) return null;
  if (start.getTime() < ref.getTime() - 60_000) return null;

  return { starts_at: start.toISOString(), ends_at: end.toISOString() };
}

/** @deprecated Use parseSlotFromText */
export function parseSlotFromTurkishText(text: string, ref = new Date()): ParsedSlot | null {
  return parseSlotFromText(text, { ref });
}

const NUMBERED_SLOT_LINE_RE = /^(\d{1,2})\s*[).:\-–]\s*(.+)$/;

export function isNumberedSlotReply(message: string): boolean {
  const m = message.trim().match(/^(\d{1,2})$/);
  if (!m) return false;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 15;
}

export function hasRecentNumberedSlotList(history: HistoryMsg[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].sender_type !== 'ai') continue;
    const lines = history[i].message.split('\n');
    for (const line of lines) {
      if (NUMBERED_SLOT_LINE_RE.test(line.trim())) return true;
    }
    return false;
  }
  return false;
}

function resolveNumberedListDateAnchor(
  aiMessage: string,
  history: HistoryMsg[],
  options: SlotParseOptions
): string | undefined {
  if (options.dateAnchor) return options.dateAnchor;

  const ref = options.ref ?? new Date();
  const timeZone = options.timezone ?? DEFAULT_COMPANY_TIMEZONE;

  for (const line of aiMessage.split('\n')) {
    const parts = extractDateParts(line, ref, timeZone);
    if (parts) {
      return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    }
  }

  for (let i = history.length - 1; i >= 0; i--) {
    const parts = extractDateParts(history[i].message, ref, timeZone);
    if (parts) {
      return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    }
  }

  return undefined;
}

function parseNumberedSlotLine(lineText: string, options: SlotParseOptions): ParsedSlot | null {
  const ref = options.ref ?? new Date();
  const timeZone = options.timezone ?? DEFAULT_COMPANY_TIMEZONE;
  const trimmed = lineText.trim();
  let text = trimmed;

  if (!extractDateParts(trimmed, ref, timeZone) && options.dateAnchor) {
    text = `${options.dateAnchor} ${trimmed}`;
  }

  return parseSlotFromText(text, options);
}

export function extractNumberedAlternative(
  history: HistoryMsg[],
  latestMessage: string,
  refOrOptions: Date | SlotParseOptions = {}
): ParsedSlot | null {
  const options = normalizeSlotOptions(refOrOptions);
  const numMatch = latestMessage.trim().match(/^(\d{1,2})\s*$/);
  if (!numMatch) return null;
  const n = parseInt(numMatch[1], 10);
  if (n < 1 || n > 15) return null;

  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].sender_type !== 'ai') continue;
    const aiMessage = history[i].message;
    const dateAnchor = resolveNumberedListDateAnchor(aiMessage, history.slice(0, i), options);
    const parseOptions = dateAnchor ? { ...options, dateAnchor } : options;

    for (const line of aiMessage.split('\n')) {
      const m = line.trim().match(NUMBERED_SLOT_LINE_RE);
      if (!m || parseInt(m[1], 10) !== n) continue;
      const slot = parseNumberedSlotLine(m[2], parseOptions);
      if (slot) return slot;
    }
  }
  return null;
}

const HOUR_CHOICE_REPLY_RE = /^(\d{1,2})\s*(?:olur|uygun|iyi|olsun|kabul|lütfen|lutfen)?\s*$/i;

/** "17 olur" gibi saat seçimlerini AI slot listesinden veya tarih bağlamından çöz */
export function extractHourChoiceFromSlotList(
  history: HistoryMsg[],
  latestMessage: string,
  refOrOptions: Date | SlotParseOptions = {}
): ParsedSlot | null {
  const options = normalizeSlotOptions(refOrOptions);
  const trimmed = latestMessage.trim();
  const m = trimmed.match(HOUR_CHOICE_REPLY_RE);
  if (!m) return null;
  const chosenHour = parseInt(m[1], 10);
  if (chosenHour < 0 || chosenHour > 23) return null;

  let startMatch: ParsedSlot | null = null;
  let endMatch: ParsedSlot | null = null;

  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].sender_type !== 'ai' && history[i].sender_type !== 'assistant') continue;
    const aiMessage = history[i].message;
    const dateAnchor = resolveNumberedListDateAnchor(aiMessage, history.slice(0, i), options);
    const parseOptions = dateAnchor ? { ...options, dateAnchor } : options;

    let foundList = false;
    for (const line of aiMessage.split('\n')) {
      const lm = line.trim().match(NUMBERED_SLOT_LINE_RE);
      if (!lm) continue;
      foundList = true;
      const slot = parseNumberedSlotLine(lm[2], parseOptions);
      if (!slot) continue;
      const tz = options.timezone ?? DEFAULT_COMPANY_TIMEZONE;
      const tm = companyTimeParts(new Date(slot.starts_at), tz);
      const endTm = companyTimeParts(new Date(slot.ends_at), tz);
      if (tm.hour === chosenHour && tm.minute === 0) {
        startMatch = slot;
      }
      if (endTm.hour === chosenHour && endTm.minute === 0) {
        endMatch = slot;
      }
    }
    if (foundList) break;
  }

  if (startMatch) return startMatch;

  const anchor =
    options.dateAnchor ||
    (() => {
      for (let i = history.length - 1; i >= 0; i--) {
        const parts = extractDateParts(
          history[i].message,
          options.ref ?? new Date(),
          options.timezone ?? DEFAULT_COMPANY_TIMEZONE
        );
        if (parts) {
          return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
        }
      }
      return undefined;
    })();

  if (anchor) {
    const bare = parseSlotFromText(`${anchor} ${chosenHour}:00`, { ...options, dateAnchor: anchor });
    if (bare) return bare;
  }

  if (endMatch) return endMatch;
  return null;
}

export function slotToAppointmentStateFields(
  slot: ParsedSlot,
  timezone: string
): { date: string; time: string } {
  const d = companyDateParts(new Date(slot.starts_at), timezone);
  const tm = companyTimeParts(new Date(slot.starts_at), timezone);
  return {
    date: `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`,
    time: `${String(tm.hour).padStart(2, '0')}:${String(tm.minute).padStart(2, '0')}`,
  };
}

/** Son AI özet mesajlarından tarih/saat çıkarır */
export function extractDateTimeFromRecentAiSummary(
  history: HistoryMsg[],
  refOrOptions: Date | SlotParseOptions = {}
): { date: string; time: string } | null {
  const options = normalizeSlotOptions(refOrOptions);
  const tz = options.timezone ?? DEFAULT_COMPANY_TIMEZONE;
  let aiSeen = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.sender_type !== 'ai' && m.sender_type !== 'assistant') continue;
    aiSeen += 1;
    if (aiSeen > 6) break;

    const slot = parseSlotFromText(m.message, options);
    if (slot) return slotToAppointmentStateFields(slot, tz);
  }

  return null;
}

export function extractSlotFromConversation(
  history: HistoryMsg[],
  latestMessage: string,
  refOrOptions: Date | SlotParseOptions = {}
): ParsedSlot | null {
  return extractCustomerSlotFromConversation(history, latestMessage, refOrOptions);
}

/** Yalnızca müşteri mesajlarından slot çıkarır — AI tekliflerini kullanmaz */
export function extractCustomerSlotFromConversation(
  history: HistoryMsg[],
  latestMessage: string,
  refOrOptions: Date | SlotParseOptions = {}
): ParsedSlot | null {
  const options = normalizeSlotOptions(refOrOptions);
  const fromNumber = extractNumberedAlternative(history, latestMessage, options);
  if (fromNumber) return fromNumber;

  const fromHour = extractHourChoiceFromSlotList(history, latestMessage, options);
  if (fromHour) return fromHour;

  if (hasDateTimeIntent(latestMessage) || HOUR_CHOICE_REPLY_RE.test(latestMessage.trim())) {
    const fromLatest = parseSlotFromText(latestMessage, options);
    if (fromLatest) return fromLatest;
  }

  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.sender_type !== 'customer') continue;
    if (!hasDateTimeIntent(m.message)) continue;
    const slot = parseSlotFromText(m.message, options);
    if (slot) return slot;
  }

  return null;
}

export function extractSlotForConfirmation(
  history: HistoryMsg[],
  latestMessage: string,
  refOrOptions: Date | SlotParseOptions = {}
): ParsedSlot | null {
  return extractCustomerSlotFromConversation(history, latestMessage, refOrOptions);
}

export function formatWeekdayLocalized(
  startsAt: string,
  lang: ConversationLang,
  timeZone: string = DEFAULT_COMPANY_TIMEZONE
): string {
  const wd = slotWeekday(startsAt, timeZone);
  return formatWeekdayName(lang, wd);
}

/** @deprecated Use formatWeekdayLocalized */
export function formatWeekdayTurkish(startsAt: string): string {
  return formatWeekdayLocalized(startsAt, 'tr');
}

export function buildAppointmentConfirmationPrompt(
  fields: {
    customer_name: string | null;
    customer_phone: string | null;
    title: string | null;
  },
  slot: ParsedSlot,
  lang: ConversationLang = 'tr',
  timeZone: string = DEFAULT_COMPANY_TIMEZONE
): string {
  const slotLabel = formatSlotLocalized(slot.starts_at, slot.ends_at, lang, timeZone);
  const weekday = formatWeekdayLocalized(slot.starts_at, lang, timeZone);
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

  return [
    t(lang, 'appointment_summary_title'),
    t(lang, 'appointment_summary_datetime', { slot: `${slotLabel}${weekdayLine}` }),
    t(lang, 'appointment_summary_name', { name: fields.customer_name || '—' }),
    t(lang, 'appointment_summary_topic', { title: fields.title || '—' }),
    t(lang, 'appointment_summary_phone', { phone: displayPhone }),
    '',
    t(lang, 'appointment_summary_confirm'),
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
  lang: ConversationLang = 'tr',
  timeZone: string = DEFAULT_COMPANY_TIMEZONE
): string {
  const locale = localeForLang(lang);
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const day = start.toLocaleDateString(locale, {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const t1 = start.toLocaleTimeString(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  });
  const t2 = end.toLocaleTimeString(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${day} ${t1}-${t2}`;
}
