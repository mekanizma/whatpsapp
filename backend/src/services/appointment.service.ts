/**
 * Randevu iş mantığı ve AI takvim entegrasyonu
 */

import { adminClient } from '../database/supabase';
import { Appointment, AppointmentSource, AppointmentStatus } from '../types';

import {
  preferHistorySlot,
  formatSlotLocalized,
  formatWeekdayLocalized,
  localToUtcInTimezone,
  companyDateParts,
} from '../ai/appointment-slot.service';
import type { AppointmentCompanyContext } from '../ai/appointment-company-context';
import { DEFAULT_APPOINTMENT_CONTEXT, buildAppointmentCompanyContext } from '../ai/appointment-company-context';
import type { HistoryMsg } from '../ai/appointment-collect.service';
import { isValidFullName, isValidProcedureTitle } from '../ai/appointment-collect.service';
import { ConversationLang, t, getAppointmentProviderLabel } from '../ai/language.service';
import {
  shouldAskAppointmentProvider,
  isGenericAppointmentTitle,
} from './appointment-category.service';
import {
  buildScheduleSummary,
  parseHm,
  weekdayToDayKey,
  type WorkingHoursSchedule,
} from './working-hours.service';

const APPOINTMENT_BLOCK_RE = /\[APPOINTMENT\]([\s\S]*?)\[\/APPOINTMENT\]/gi;
const FALSE_SUCCESS_RE =
  /randevu(nuz)?\s+(başarıyla\s+|basariyla\s+)?(oluşturuldu|olusturuldu|alındı|alindi|onaylandı|onaylandi|kaydedildi|kaydediyorum)/i;

export const APPOINTMENT_MARKER = '[APPOINTMENT]';

export interface AppointmentInput {
  customer_phone: string;
  customer_name?: string | null;
  title?: string;
  notes?: string | null;
  preferred_doctor?: string | null;
  starts_at: string;
  ends_at: string;
  status?: AppointmentStatus;
  source?: AppointmentSource;
}

export interface ParsedAppointmentAction {
  starts_at: string;
  ends_at: string;
  customer_name?: string;
  customer_phone?: string;
  title?: string;
  notes?: string;
  doctor_name?: string;
  preferred_doctor?: string;
}

function formatSlot(start: Date, end: Date, locale = 'tr-TR', timeZone = DEFAULT_APPOINTMENT_CONTEXT.timezone): string {
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

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function buildNotes(action: ParsedAppointmentAction): string | null {
  const parts: string[] = [];
  if (action.notes?.trim()) parts.push(action.notes.trim());
  return parts.length > 0 ? parts.join('\n') : null;
}

function getDoctorName(action: ParsedAppointmentAction): string | null {
  return action.doctor_name?.trim() || action.preferred_doctor?.trim() || null;
}

export async function fetchCompanyCategory(companyId: string): Promise<string> {
  const { data } = await adminClient
    .from('companies')
    .select('category')
    .eq('id', companyId)
    .maybeSingle();
  return data?.category || 'diger';
}

function sanitizeAppointmentInput(
  category: string,
  input: AppointmentInput
): AppointmentInput {
  const askProvider = shouldAskAppointmentProvider(category);
  let title = input.title?.trim() || '';
  let notes = input.notes?.trim() || null;
  let preferred_doctor = input.preferred_doctor?.trim() || null;

  if (!askProvider) {
    if (preferred_doctor && isGenericAppointmentTitle(title) && isValidProcedureTitle(preferred_doctor)) {
      title = preferred_doctor;
    }
    preferred_doctor = null;
  }

  if (isGenericAppointmentTitle(title) && notes && isValidProcedureTitle(notes)) {
    title = notes;
    notes = null;
  }

  return {
    ...input,
    title: title || 'Randevu',
    notes,
    preferred_doctor,
  };
}

export function validateAppointmentAction(
  action: ParsedAppointmentAction,
  _fallbackPhone = '',
  lang: ConversationLang = 'tr'
): string | null {
  if (!action.customer_name?.trim() || !isValidFullName(action.customer_name)) {
    return t(lang, 'appointment_name');
  }
  const phone = normalizePhone(action.customer_phone?.trim() || '');
  if (!phone || phone.length < 10) {
    return t(lang, 'appointment_phone');
  }
  if (!action.title?.trim() || !isValidProcedureTitle(action.title)) {
    return t(lang, 'appointment_title');
  }
  if (!action.starts_at || !action.ends_at) {
    return t(lang, 'appointment_validation_datetime_missing');
  }
  const start = new Date(action.starts_at);
  const end = new Date(action.ends_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return t(lang, 'appointment_validation_datetime_invalid');
  }
  return null;
}

export async function listAppointments(
  companyId: string,
  from: string,
  to: string
): Promise<Appointment[]> {
  const { data, error } = await adminClient
    .from('appointments')
    .select('*')
    .eq('company_id', companyId)
    .gte('starts_at', from)
    .lt('starts_at', to)
    .neq('status', 'cancelled')
    .order('starts_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as Appointment[];
}

/** Panel için yaklaşan randevular */
export async function listUpcomingAppointments(
  companyId: string,
  daysAhead = 60
): Promise<Appointment[]> {
  const now = new Date().toISOString();
  const until = new Date();
  until.setDate(until.getDate() + daysAhead);

  return listAppointments(companyId, now, until.toISOString());
}

export async function hasConflict(
  companyId: string,
  startsAt: string,
  endsAt: string,
  excludeId?: string
): Promise<boolean> {
  let query = adminClient
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('status', ['pending', 'confirmed'])
    .lt('starts_at', endsAt)
    .gt('ends_at', startsAt);

  if (excludeId) query = query.neq('id', excludeId);

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return (count || 0) > 0;
}

const SLOT_STEP_MS = 30 * 60 * 1000;
const DEFAULT_SLOT_DURATION_MS = SLOT_STEP_MS;
const DEFAULT_SEARCH_DAYS = 30;
const DEFAULT_AVAILABLE_SLOT_COUNT = 15;

function slotOverlapsAppointment(
  slotStart: Date,
  slotEnd: Date,
  appointments: Appointment[]
): boolean {
  for (const a of appointments) {
    const aStart = new Date(a.starts_at);
    const aEnd = new Date(a.ends_at);
    if (slotStart < aEnd && slotEnd > aStart) return true;
  }
  return false;
}

function isSlotInsideBreak(
  startMin: number,
  endMin: number,
  breaks: { start: string; end: string }[] = []
): boolean {
  for (const br of breaks) {
    const breakStart = parseHm(br.start);
    const breakEnd = parseHm(br.end);
    if (startMin < breakEnd && endMin > breakStart) return true;
  }
  return false;
}

function addDaysToParts(
  parts: { year: number; month: number; day: number },
  days: number,
  timeZone: string
) {
  const d = localToUtcInTimezone(parts.year, parts.month, parts.day, 12, 0, timeZone);
  d.setUTCDate(d.getUTCDate() + days);
  return companyDateParts(d, timeZone);
}

function weekdayFromParts(
  parts: { year: number; month: number; day: number },
  timeZone: string
): number {
  return localToUtcInTimezone(parts.year, parts.month, parts.day, 12, 0, timeZone).getUTCDay();
}

function advanceCursorInSchedule(
  cursor: Date,
  schedule: WorkingHoursSchedule,
  timeZone: string
): Date | null {
  const maxIterations = 366;
  let next = new Date(cursor.getTime());

  for (let i = 0; i < maxIterations; i++) {
    const parts = companyDateParts(next, timeZone);
    const { hour, minute } = (() => {
      const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const [h, m] = fmt.format(next).split(':').map(Number);
      return { hour: h, minute: m };
    })();
    const minuteOfDay = hour * 60 + minute;
    const wd = weekdayFromParts(parts, timeZone);
    const dayKey = weekdayToDayKey(wd);
    const daySchedule = schedule[dayKey];

    if (!daySchedule) {
      const tomorrow = addDaysToParts(parts, 1, timeZone);
      next = localToUtcInTimezone(tomorrow.year, tomorrow.month, tomorrow.day, 0, 0, timeZone);
      continue;
    }

    const openMin = parseHm(daySchedule.open);
    const closeMin = parseHm(daySchedule.close);

    if (minuteOfDay < openMin) {
      return localToUtcInTimezone(parts.year, parts.month, parts.day, Math.floor(openMin / 60), openMin % 60, timeZone);
    }

    if (minuteOfDay >= closeMin) {
      const tomorrow = addDaysToParts(parts, 1, timeZone);
      next = localToUtcInTimezone(tomorrow.year, tomorrow.month, tomorrow.day, 0, 0, timeZone);
      continue;
    }

    const alignedMin = minuteOfDay % 30 === 0 ? minuteOfDay : minuteOfDay + (30 - (minuteOfDay % 30));
    if (alignedMin >= closeMin) {
      const tomorrow = addDaysToParts(parts, 1, timeZone);
      next = localToUtcInTimezone(tomorrow.year, tomorrow.month, tomorrow.day, 0, 0, timeZone);
      continue;
    }

    const alignedHour = Math.floor(alignedMin / 60);
    const alignedMinute = alignedMin % 60;
    const candidate = localToUtcInTimezone(
      parts.year,
      parts.month,
      parts.day,
      alignedHour,
      alignedMinute,
      timeZone
    );
    const endMin = alignedMin + DEFAULT_SLOT_DURATION_MS / 60_000;
    if (endMin > closeMin || isSlotInsideBreak(alignedMin, endMin, daySchedule.breaks)) {
      next = new Date(candidate.getTime() + SLOT_STEP_MS);
      continue;
    }

    return candidate;
  }

  return null;
}

async function fetchCompanyAppointmentContext(companyId: string): Promise<AppointmentCompanyContext> {
  const { data } = await adminClient
    .from('companies')
    .select('working_hours, timezone')
    .eq('id', companyId)
    .maybeSingle();

  return buildAppointmentCompanyContext(data?.working_hours, data?.timezone);
}

/** Yönetici paneli takvimine ve çalışma saatlerine göre gerçek müsait slotları hesapla */
export async function findAvailableSlots(
  companyId: string,
  ctx: AppointmentCompanyContext = DEFAULT_APPOINTMENT_CONTEXT,
  opts: {
    count?: number;
    daysAhead?: number;
    durationMs?: number;
    after?: Date;
  } = {}
): Promise<{ starts_at: string; ends_at: string }[]> {
  const count = opts.count ?? DEFAULT_AVAILABLE_SLOT_COUNT;
  const daysAhead = opts.daysAhead ?? DEFAULT_SEARCH_DAYS;
  const durationMs = opts.durationMs ?? DEFAULT_SLOT_DURATION_MS;
  const now = opts.after ?? new Date();
  const until = new Date(now);
  until.setDate(until.getDate() + daysAhead);

  const busyAppointments = await listAppointments(companyId, now.toISOString(), until.toISOString());
  const results: { starts_at: string; ends_at: string }[] = [];

  let cursor = advanceCursorInSchedule(now, ctx.schedule, ctx.timezone);
  if (!cursor) return results;

  const searchUntil = until.getTime();

  while (results.length < count && cursor.getTime() < searchUntil) {
    const parts = companyDateParts(cursor, ctx.timezone);
    const { hour, minute } = (() => {
      const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: ctx.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const [h, m] = fmt.format(cursor).split(':').map(Number);
      return { hour: h, minute: m };
    })();
    const startMin = hour * 60 + minute;
    const endMin = startMin + durationMs / 60_000;
    const wd = weekdayFromParts(parts, ctx.timezone);
    const daySchedule = ctx.schedule[weekdayToDayKey(wd)];

    if (daySchedule) {
      const closeMin = parseHm(daySchedule.close);
      if (
        endMin <= closeMin &&
        !isSlotInsideBreak(startMin, endMin, daySchedule.breaks) &&
        cursor.getTime() >= now.getTime()
      ) {
        const endHour = Math.floor(endMin / 60);
        const endMinute = endMin % 60;
        const slotEnd = localToUtcInTimezone(
          parts.year,
          parts.month,
          parts.day,
          endHour,
          endMinute,
          ctx.timezone
        );
        if (!slotOverlapsAppointment(cursor, slotEnd, busyAppointments)) {
          results.push({ starts_at: cursor.toISOString(), ends_at: slotEnd.toISOString() });
        }
      }
    }

    const nextCursor = advanceCursorInSchedule(
      new Date(cursor.getTime() + SLOT_STEP_MS),
      ctx.schedule,
      ctx.timezone
    );
    if (!nextCursor || nextCursor.getTime() <= cursor.getTime()) break;
    cursor = nextCursor;
  }

  return results;
}

/** Dolu saate yakın müsait alternatifler bul — yönetici paneli takvimine göre */
export async function findAlternativeSlots(
  companyId: string,
  preferredStartIso: string,
  preferredEndIso?: string,
  count = 3
): Promise<{ starts_at: string; ends_at: string }[]> {
  const ctx = await fetchCompanyAppointmentContext(companyId);
  const durationMs = preferredEndIso
    ? Math.max(new Date(preferredEndIso).getTime() - new Date(preferredStartIso).getTime(), SLOT_STEP_MS)
    : SLOT_STEP_MS;

  const after = new Date(Math.max(new Date(preferredStartIso).getTime(), Date.now()));
  const all = await findAvailableSlots(companyId, ctx, {
    count: count + 5,
    daysAhead: DEFAULT_SEARCH_DAYS,
    durationMs,
    after,
  });

  return all.slice(0, count);
}

export async function buildConflictMessageWithAlternatives(
  companyId: string,
  startsAt: string,
  endsAt: string,
  lang: ConversationLang = 'tr'
): Promise<string> {
  const requested = formatSlotLocalized(startsAt, endsAt, lang);
  const alternatives = await findAlternativeSlots(companyId, startsAt, endsAt, 3);

  if (alternatives.length === 0) {
    return t(lang, 'appointment_conflict_no_alts', { requested });
  }

  const formatted = alternatives
    .map((s, i) => `${i + 1}) ${formatSlotLocalized(s.starts_at, s.ends_at, lang)}`)
    .join('\n');

  return t(lang, 'appointment_conflict_alts', { requested, options: formatted });
}

export async function createAppointment(
  companyId: string,
  input: AppointmentInput
): Promise<Appointment> {
  const conflict = await hasConflict(companyId, input.starts_at, input.ends_at);
  if (conflict) {
    throw new Error('Bu saat aralığında başka bir randevu var.');
  }

  const category = await fetchCompanyCategory(companyId);
  const sanitized = sanitizeAppointmentInput(category, input);

  const { data, error } = await adminClient
    .from('appointments')
    .insert({
      company_id: companyId,
      customer_phone: normalizePhone(sanitized.customer_phone),
      customer_name: sanitized.customer_name?.trim() || null,
      title: sanitized.title || 'Randevu',
      notes: sanitized.notes || null,
      preferred_doctor: sanitized.preferred_doctor?.trim() || null,
      starts_at: sanitized.starts_at,
      ends_at: sanitized.ends_at,
      status: sanitized.status || 'confirmed',
      source: sanitized.source || 'panel',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Appointment;
}

export async function updateAppointment(
  companyId: string,
  id: string,
  updates: Partial<AppointmentInput> & { status?: AppointmentStatus }
): Promise<Appointment> {
  if (updates.starts_at && updates.ends_at) {
    const conflict = await hasConflict(companyId, updates.starts_at, updates.ends_at, id);
    if (conflict) throw new Error('Bu saat aralığında başka bir randevu var.');
  }

  const payload = { ...updates };
  if (payload.customer_phone) {
    payload.customer_phone = normalizePhone(payload.customer_phone);
  }

  const { data, error } = await adminClient
    .from('appointments')
    .update(payload)
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Appointment;
}

export async function deleteAppointment(companyId: string, id: string): Promise<void> {
  const { error } = await adminClient
    .from('appointments')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId);

  if (error) throw new Error(error.message);
}

/** AI sistem promptu — yönetici paneli takvimine göre dolu ve müsait saatler */
export async function getAppointmentContextForAI(companyId: string): Promise<string> {
  const ctx = await fetchCompanyAppointmentContext(companyId);
  const now = new Date();
  const until = new Date(now);
  until.setDate(until.getDate() + DEFAULT_SEARCH_DAYS);

  const [items, availableSlots, category] = await Promise.all([
    listAppointments(companyId, now.toISOString(), until.toISOString()),
    findAvailableSlots(companyId, ctx, { count: DEFAULT_AVAILABLE_SLOT_COUNT, daysAhead: DEFAULT_SEARCH_DAYS }),
    fetchCompanyCategory(companyId),
  ]);

  const askProvider = shouldAskAppointmentProvider(category);
  const providerLabel = getAppointmentProviderLabel('tr', undefined, category);
  const scheduleSummary = buildScheduleSummary(ctx.schedule, 'tr');

  const sections: string[] = [
    `ÇALIŞMA SAATLERİ: ${scheduleSummary}`,
    '',
    'KURALLAR:',
    '- Tarih/saat önerirken MUTLAKA tam tarih ve saat yaz (ör. 15.07.2026 17:00). "yarın", "15 gün sonra", "ertesi gün" gibi göreceli ifadeler KULLANMA.',
    '- Müsaitlik yalnızca aşağıdaki MÜSAİT SAATLER listesine göre belirlenir; kafadan dolu/boş deme.',
    '- DOLU SAATLER listesindeki saatleri ASLA önerme.',
    '- Müşteri göreceli tarih söylerse (ör. "15 gün sonra 17:00") tam takvim tarihini hesaplayıp yaz.',
  ];

  if (items.length > 0) {
    const busyLines = items.slice(0, 25).map((a) => {
      const start = new Date(a.starts_at);
      const end = new Date(a.ends_at);
      const who = a.customer_name || a.customer_phone;
      const doctor =
        askProvider && a.preferred_doctor ? ` | ${providerLabel}: ${a.preferred_doctor}` : '';
      return `- ${formatSlot(start, end, 'tr-TR', ctx.timezone)}: ${who} — ${a.title}${doctor} [${a.status}]`;
    });
    const more = items.length > 25 ? `\n... ve ${items.length - 25} randevu daha` : '';
    sections.push('', `DOLU SAATLER (yönetici paneli takvimi — önerme):`, ...busyLines, more);
  } else {
    sections.push('', 'DOLU SAATLER: Önümüzdeki 30 günde kayıtlı randevu yok.');
  }

  if (availableSlots.length > 0) {
    const availableLines = availableSlots.map((slot, i) => {
      const label = formatSlotLocalized(slot.starts_at, slot.ends_at, 'tr', ctx.timezone);
      const weekday = formatWeekdayLocalized(slot.starts_at, 'tr', ctx.timezone);
      const weekdayPart = weekday ? ` (${weekday.charAt(0).toUpperCase()}${weekday.slice(1)})` : '';
      return `${i + 1}) ${label}${weekdayPart}`;
    });
    sections.push(
      '',
      'MÜSAİT SAATLER (yönetici paneli takvimine göre hesaplanmış — YALNIZCA bunları öner):',
      ...availableLines
    );
  } else {
    sections.push(
      '',
      'MÜSAİT SAATLER: Önümüzdeki 30 günde müsait saat bulunmuyor. Müşteriye bunu açıkça belirt; kafadan saat önerme.'
    );
  }

  return sections.join('\n');
}

export function stripAppointmentMarkers(text: string): string {
  return text
    .replace(/\[APPOINTMENT\][\s\S]*?\[\/APPOINTMENT\]/gi, '')
    .replace(/\[APPOINTMENT\][\s\S]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  let local = digits;
  if (digits.length >= 12 && digits.startsWith('90')) {
    local = `0${digits.slice(2)}`;
  } else if (digits.length === 10 && digits.startsWith('5')) {
    local = `0${digits}`;
  }
  if (local.length === 11 && local.startsWith('0')) {
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7, 9)} ${local.slice(9)}`;
  }
  return phone;
}

/** Müşteriye gösterilecek randevu onay mesajı */
export function buildAppointmentConfirmationMessage(
  appointment: Appointment,
  lang: ConversationLang = 'tr',
  companyCategory?: string | null
): string {
  const slot = formatSlotLocalized(appointment.starts_at, appointment.ends_at, lang);
  const askProvider = shouldAskAppointmentProvider(companyCategory);
  const providerLabel = getAppointmentProviderLabel(lang, undefined, companyCategory);
  const doctorLine =
    askProvider && appointment.preferred_doctor
      ? t(lang, 'appointment_confirmed_doctor', {
          doctor: appointment.preferred_doctor,
          provider_label: providerLabel,
        })
      : '';

  return t(lang, 'appointment_confirmed', {
    slot,
    name: appointment.customer_name || '—',
    title: appointment.title,
    phone: formatPhoneDisplay(appointment.customer_phone),
    doctor_line: doctorLine,
  });
}

/** [APPOINTMENT] teknik bloğunu müşteri mesajından temizle */
export function finalizeCustomerFacingMessage(
  message: string,
  opts: { hadAppointmentMarker?: boolean; lang?: ConversationLang } = {}
): string {
  const lang = opts.lang || 'tr';
  const cleaned = stripAppointmentMarkers(message);
  if (cleaned && !/\[APPOINTMENT\]/i.test(cleaned)) return cleaned;
  if (opts.hadAppointmentMarker || message.includes(APPOINTMENT_MARKER)) {
    return t(lang, 'appointment_processing');
  }
  return cleaned;
}

export function parseAppointmentAction(text: string): ParsedAppointmentAction | null {
  const match = APPOINTMENT_BLOCK_RE.exec(text);
  APPOINTMENT_BLOCK_RE.lastIndex = 0;
  if (!match?.[1]) return null;

  const raw = match[1].trim();
  try {
    const parsed = JSON.parse(raw) as ParsedAppointmentAction;
    if (!parsed.starts_at || !parsed.ends_at) return null;
    const start = new Date(parsed.starts_at);
    const end = new Date(parsed.ends_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return null;
    }
    return parsed;
  } catch {
    console.warn('[Randevu] APPOINTMENT JSON parse hatası:', raw.slice(0, 120));
    return null;
  }
}

function fixFalseSuccessMessage(
  message: string,
  appointment: Appointment | null,
  hadMarker: boolean,
  lang: ConversationLang = 'tr'
): string {
  if (appointment) return message;

  const claimsSuccess = FALSE_SUCCESS_RE.test(message);
  if (!claimsSuccess) return message;

  if (hadMarker) {
    return t(lang, 'appointment_booking_incomplete_retry');
  }

  return message.replace(
    FALSE_SUCCESS_RE,
    t(lang, 'appointment_false_success_pending')
  );
}

export async function processAIAppointmentBooking(
  companyId: string,
  customerPhone: string,
  _customerName: string | null,
  rawResponse: string,
  collected?: { customer_name: string | null; customer_phone: string | null; title: string | null; doctor_name?: string | null },
  history: HistoryMsg[] = [],
  lang: ConversationLang = 'tr',
  latestMessage = '',
  userConfirmed = false,
  ctx: AppointmentCompanyContext = DEFAULT_APPOINTMENT_CONTEXT
): Promise<{ message: string; appointment: Appointment | null }> {
  const hadMarker = rawResponse.includes(APPOINTMENT_MARKER);
  const action = parseAppointmentAction(rawResponse);
  let message = stripAppointmentMarkers(rawResponse);

  if (!action) {
    message = fixFalseSuccessMessage(message, null, hadMarker, lang);
    if (hadMarker && !action) {
      console.error('[Randevu] Marker var ama JSON okunamadı');
    }
    return { message, appointment: null };
  }

  const slot = preferHistorySlot(history, action, latestMessage, { timezone: ctx.timezone });
  const actionWithSlot = slot ? { ...action, ...slot } : action;

  const mergedAction: ParsedAppointmentAction = {
    ...actionWithSlot,
    customer_name: actionWithSlot.customer_name?.trim() || collected?.customer_name?.trim() || undefined,
    customer_phone: actionWithSlot.customer_phone?.trim() || collected?.customer_phone?.trim() || undefined,
    title: actionWithSlot.title?.trim() || collected?.title?.trim() || undefined,
    doctor_name: actionWithSlot.doctor_name || actionWithSlot.preferred_doctor || collected?.doctor_name || undefined,
  };

  const validationError = validateAppointmentAction(mergedAction, customerPhone, lang);
  if (validationError) {
    console.warn('[Randevu] Doğrulama hatası:', validationError);
    return { message: validationError, appointment: null };
  }

  if (!userConfirmed) {
    const slotLabel = formatSlotLocalized(mergedAction.starts_at, mergedAction.ends_at, lang, ctx.timezone);
    const confirmMsg = t(lang, 'appointment_confirm_prompt', { slot: slotLabel });
    return { message: confirmMsg, appointment: null };
  }

  const conflict = await hasConflict(
    companyId,
    mergedAction.starts_at,
    mergedAction.ends_at
  );
  if (conflict) {
    const altMsg = await buildConflictMessageWithAlternatives(
      companyId,
      mergedAction.starts_at,
      mergedAction.ends_at,
      lang
    );
    return { message: altMsg, appointment: null };
  }

  try {
    const category = await fetchCompanyCategory(companyId);
    const appointment = await createAppointment(companyId, {
      customer_phone: mergedAction.customer_phone || customerPhone,
      customer_name: mergedAction.customer_name!.trim(),
      title: mergedAction.title!.trim(),
      notes: buildNotes(mergedAction),
      preferred_doctor: shouldAskAppointmentProvider(category)
        ? getDoctorName(mergedAction)
        : null,
      starts_at: new Date(mergedAction.starts_at).toISOString(),
      ends_at: new Date(mergedAction.ends_at).toISOString(),
      status: 'confirmed',
      source: 'ai',
    });

    message = buildAppointmentConfirmationMessage(appointment, lang, category);

    console.log(`[Randevu] Oluşturuldu: ${appointment.id} | ${appointment.customer_name} | ${appointment.title}`);
    return { message, appointment };
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error('[Randevu] Kayıt hatası:', errMsg);
    if (/başka bir randevu|çakışma/i.test(errMsg)) {
      const altMsg = await buildConflictMessageWithAlternatives(
        companyId,
        mergedAction.starts_at,
        mergedAction.ends_at,
        lang
      );
      return { message: altMsg, appointment: null };
    }
    return {
      message: t(lang, 'appointment_booking_failed', { error: errMsg }),
      appointment: null,
    };
  }
}
