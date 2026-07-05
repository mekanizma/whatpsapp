/**
 * Randevu iş mantığı ve AI takvim entegrasyonu
 */

import { adminClient } from '../database/supabase';
import { Appointment, AppointmentSource, AppointmentStatus } from '../types';

import {
  preferHistorySlot,
  formatSlotLocalized,
  turkeyLocalToUtc,
  turkeyDateParts,
  turkeyTimeParts,
} from '../ai/appointment-slot.service';
import type { AppointmentCompanyContext } from '../ai/appointment-company-context';
import { DEFAULT_APPOINTMENT_CONTEXT } from '../ai/appointment-company-context';
import type { HistoryMsg } from '../ai/appointment-collect.service';
import { isValidFullName, isValidProcedureTitle } from '../ai/appointment-collect.service';
import { ConversationLang, t, getAppointmentProviderLabel } from '../ai/language.service';
import {
  shouldAskAppointmentProvider,
  isGenericAppointmentTitle,
} from './appointment-category.service';

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

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
const SLOT_STEP_MS = 30 * 60 * 1000;

function turkeyWeekday(ref: Date): number {
  return turkeyLocalToUtc(
    turkeyDateParts(ref).year,
    turkeyDateParts(ref).month,
    turkeyDateParts(ref).day,
    12,
    0
  ).getUTCDay();
}

function advanceToNextWorkSlot(cursor: Date): Date {
  let next = new Date(cursor.getTime());
  for (let i = 0; i < 366; i++) {
    const parts = turkeyDateParts(next);
    const { hour } = turkeyTimeParts(next);
    const wd = turkeyWeekday(next);

    if (wd === 0) {
      const d = addDaysParts(parts, 1);
      next = turkeyLocalToUtc(d.year, d.month, d.day, WORK_START_HOUR, 0);
      continue;
    }

    if (hour < WORK_START_HOUR) {
      next = turkeyLocalToUtc(parts.year, parts.month, parts.day, WORK_START_HOUR, 0);
      return next;
    }

    if (hour >= WORK_END_HOUR) {
      const d = addDaysParts(parts, 1);
      next = turkeyLocalToUtc(d.year, d.month, d.day, WORK_START_HOUR, 0);
      continue;
    }

    return next;
  }
  return next;
}

function addDaysParts(parts: { year: number; month: number; day: number }, days: number) {
  const d = turkeyLocalToUtc(parts.year, parts.month, parts.day, 12, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return turkeyDateParts(d);
}

/** Dolu saate yakın müsait alternatifler bul */
export async function findAlternativeSlots(
  companyId: string,
  preferredStartIso: string,
  preferredEndIso?: string,
  count = 3
): Promise<{ starts_at: string; ends_at: string }[]> {
  const durationMs = preferredEndIso
    ? Math.max(new Date(preferredEndIso).getTime() - new Date(preferredStartIso).getTime(), SLOT_STEP_MS)
    : SLOT_STEP_MS;

  let cursor = advanceToNextWorkSlot(new Date(preferredStartIso));
  const now = new Date();
  if (cursor.getTime() < now.getTime()) {
    cursor = advanceToNextWorkSlot(now);
  }

  const results: { starts_at: string; ends_at: string }[] = [];
  const searchUntil = Date.now() + 14 * 24 * 60 * 60 * 1000;

  while (results.length < count && cursor.getTime() < searchUntil) {
    cursor = advanceToNextWorkSlot(cursor);
    const { hour } = turkeyTimeParts(cursor);
    if (hour >= WORK_END_HOUR) {
      const parts = turkeyDateParts(cursor);
      const nextDay = addDaysParts(parts, 1);
      cursor = turkeyLocalToUtc(nextDay.year, nextDay.month, nextDay.day, WORK_START_HOUR, 0);
      continue;
    }

    const end = new Date(cursor.getTime() + durationMs);
    const conflict = await hasConflict(companyId, cursor.toISOString(), end.toISOString());
    if (!conflict) {
      results.push({ starts_at: cursor.toISOString(), ends_at: end.toISOString() });
    }
    cursor = new Date(cursor.getTime() + SLOT_STEP_MS);
  }

  return results;
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

/** AI sistem promptu için önümüzdeki randevular özeti */
export async function getAppointmentContextForAI(companyId: string): Promise<string> {
  const now = new Date();
  const until = new Date(now);
  until.setDate(until.getDate() + 14);

  const items = await listAppointments(companyId, now.toISOString(), until.toISOString());
  const category = await fetchCompanyCategory(companyId);
  const askProvider = shouldAskAppointmentProvider(category);
  const providerLabel = getAppointmentProviderLabel('tr', undefined, category);

  if (items.length === 0) {
    return 'Önümüzdeki 14 günde kayıtlı randevu yok. Müsait saatleri bilgi bankası çalışma saatlerine göre öner.';
  }

  const lines = items.slice(0, 25).map((a) => {
    const start = new Date(a.starts_at);
    const end = new Date(a.ends_at);
    const who = a.customer_name || a.customer_phone;
    const doctor =
      askProvider && a.preferred_doctor ? ` | ${providerLabel}: ${a.preferred_doctor}` : '';
    return `- ${formatSlot(start, end)}: ${who} — ${a.title}${doctor} [${a.status}]`;
  });

  const more = items.length > 25 ? `\n... ve ${items.length - 25} randevu daha` : '';
  return `DOLU SAATLER (çakışma yapma):\n${lines.join('\n')}${more}`;
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
