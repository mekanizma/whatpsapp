/**
 * Konuşmadan teklif edilen randevu saatini çıkarır (TR, Europe/Istanbul)
 */

import { HistoryMsg } from './appointment-collect.service';
import { ConversationLang, localeForLang } from './language.service';

const CLINIC_TZ = 'Europe/Istanbul';
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface ParsedSlot {
  starts_at: string;
  ends_at: string;
}

function turkeyDateParts(ref: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = fmt.format(ref).split('-').map(Number);
  return { year, month, day };
}

function turkeyLocalToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0) - TR_OFFSET_MS);
}

function addDays(parts: { year: number; month: number; day: number }, days: number) {
  const d = turkeyLocalToUtc(parts.year, parts.month, parts.day, 12, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return turkeyDateParts(d);
}

const OFFER_CONTEXT_RE =
  /onaylıyor|onayliyor|uygun|müsait|musait|alabilirsiniz|öneriyorum|oneriyorum|randevu.*saat|saat.*randevu/i;

function extractTimeFromText(text: string): { hour: number; minute: number } | null {
  const saatMatch = text.match(/saat\s*(\d{1,2})[:.](\d{2})/i);
  if (saatMatch) {
    const hour = parseInt(saatMatch[1], 10);
    const minute = parseInt(saatMatch[2], 10);
    if (hour <= 23 && minute <= 59) return { hour, minute };
  }

  const rangeMatch = text.match(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/);
  if (rangeMatch) {
    const hour = parseInt(rangeMatch[1], 10);
    const minute = parseInt(rangeMatch[2], 10);
    if (hour <= 23 && minute <= 59) return { hour, minute };
  }

  const candidates = [...text.matchAll(/(\d{1,2})[:.](\d{2})/g)];
  for (let i = candidates.length - 1; i >= 0; i--) {
    const m = candidates[i];
    const idx = m.index ?? 0;
    const before = text.slice(Math.max(0, idx - 3), idx);
    const after = text.slice(idx + m[0].length, idx + m[0].length + 5);
    if (/^\d{1,2}\.$/.test(before) || /^\.\d{2,4}/.test(after)) continue;
    const hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    if (hour <= 23 && minute <= 59) return { hour, minute };
  }
  return null;
}

/** Tek bir metinden tarih/saat çıkar */
export function parseSlotFromTurkishText(text: string, ref = new Date()): ParsedSlot | null {
  const time = extractTimeFromText(text);
  if (!time) return null;
  const { hour, minute } = time;

  const lower = text.toLocaleLowerCase('tr');
  const trNow = turkeyDateParts(ref);
  let { year, month, day } = trNow;

  if (/\byarın\b|\byarin\b/.test(lower)) {
    ({ year, month, day } = addDays(trNow, 1));
  } else if (/\böbür gün\b|\bobur\s+gün\b|\bobur\s+gun\b/.test(lower)) {
    ({ year, month, day } = addDays(trNow, 2));
  } else if (/\bbugün\b|\bbugun\b/.test(lower)) {
    // bugün
  } else {
    const dateMatch = text.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
    if (dateMatch) {
      day = parseInt(dateMatch[1], 10);
      month = parseInt(dateMatch[2], 10);
      const y = dateMatch[3];
      if (y) year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
    } else if (/\byarın\b|\byarin\b/.test(lower) === false) {
      const startToday = turkeyLocalToUtc(trNow.year, trNow.month, trNow.day, hour, minute);
      if (startToday.getTime() <= ref.getTime()) {
        ({ year, month, day } = addDays(trNow, 1));
      }
    }
  }

  const start = turkeyLocalToUtc(year, month, day, hour, minute);
  let end = new Date(start.getTime() + 30 * 60 * 1000);

  const rangeMatch = text.match(
    /(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/
  );
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

/** Onay öncesi son AI teklifindeki saati bul */
export function extractOfferedSlotFromHistory(
  history: HistoryMsg[],
  ref = new Date()
): ParsedSlot | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.sender_type !== 'ai') continue;
    const text = m.message;
    if (!OFFER_CONTEXT_RE.test(text) && !/\d{1,2}[:.]\d{2}/.test(text)) continue;
    const slot = parseSlotFromTurkishText(text, ref);
    if (slot) return slot;
  }
  return null;
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
  action: { starts_at?: string; ends_at?: string }
): { starts_at: string; ends_at: string } | null {
  const offered = extractOfferedSlotFromHistory(history);
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
