/**
 * Deterministik randevu akışı — müsaitlik YALNIZCA veritabanından okunur.
 * LLM asla randevu müsaitliği üretmez.
 */

import { Appointment } from '../types';
import {
  bookAppointment,
  AppointmentBookingError,
  hasConflict,
  buildAppointmentConfirmationMessage,
  fetchCompanyCategory,
  logAppointmentEvent,
  listAppointments,
} from '../services/appointment.service';
import {
  extractCustomerSlotFromConversation,
  formatSlotLocalized,
  validateSlotWorkingHours,
  buildWorkingHoursRejectionMessage,
  parseDateAnchorFromText,
  extractDateTimeFromRecentAiSummary,
  ParsedSlot,
  companyDateParts,
  slotWeekday,
} from './appointment-slot.service';
import { hasAvailabilityQuery } from './appointment-datetime-tokens';
import { isAppointmentConfirmation } from './appointment-confirm.service';
import { ConversationLang, detectConversationLanguage, t } from './language.service';
import {
  type AppointmentCompanyContext,
  DEFAULT_APPOINTMENT_CONTEXT,
} from './appointment-company-context';
import {
  HistoryMsg,
  parseCollectedFields,
  getMissingRequiredFields,
  buildMissingFieldsMessage,
  buildAllRequiredFieldsMessage,
  mergeCollectedWithAction,
  promptForMissingField,
} from './appointment-collect.service';
import { localToUtcInTimezone } from './appointment-slot.service';
import { parseHm, weekdayToDayKey } from '../services/working-hours.service';
import { buildSlotFromState } from './appointment-llm-validation.service';

const SLOT_STEP_MINUTES = 30;

const APPOINTMENT_STATUS_INQUIRY_RE =
  /oluşturd|olusturd|kaydett|takvime\s*(işl|isl)|randevum\s*var|randevu\s*old[uü]|onaylad[ıi]n/i;

function normalizePhoneForLookup(phone: string): string {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('0')) d = `90${d.slice(1)}`;
  if (d.length === 10 && d.startsWith('5')) d = `90${d}`;
  return d;
}

function isAppointmentStatusInquiry(message: string): boolean {
  return APPOINTMENT_STATUS_INQUIRY_RE.test(message.trim());
}

async function handleAppointmentStatusInquiry(
  companyId: string,
  customerPhone: string,
  lang: ConversationLang,
  ctx: AppointmentCompanyContext
): Promise<AppointmentWorkflowResult> {
  try {
    const now = new Date();
    const until = new Date();
    until.setDate(until.getDate() + 60);
    const appointments = await listAppointments(companyId, now.toISOString(), until.toISOString());
    const mine = appointments
      .filter(
        (a) =>
          normalizePhoneForLookup(a.customer_phone) === normalizePhoneForLookup(customerPhone) &&
          (a.status === 'pending' || a.status === 'confirmed')
      )
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

    if (mine.length === 0) {
      return {
        handled: true,
        message: t(lang, 'appointment_status_not_found'),
        appointment: null,
      };
    }

    const latest = mine[0];
    const slot = formatSlotLocalized(latest.starts_at, latest.ends_at, lang, ctx.timezone);
    const statusLabel =
      latest.status === 'confirmed'
        ? lang === 'tr'
          ? 'Onaylandı'
          : 'Confirmed'
        : lang === 'tr'
          ? 'Beklemede'
          : 'Pending';

    return {
      handled: true,
      message: t(lang, 'appointment_status_found', {
        slot,
        title: latest.title,
        status: statusLabel,
      }),
      appointment: latest,
    };
  } catch {
    return {
      handled: true,
      message: t(lang, 'appointment_db_unavailable'),
      appointment: null,
    };
  }
}

export interface AppointmentWorkflowResult {
  handled: boolean;
  message: string;
  appointment: Appointment | null;
}

export function isAvailabilityInquiry(message: string): boolean {
  const n = message.toLocaleLowerCase('tr');
  const hasAvailability =
    hasAvailabilityQuery(message) ||
    /en erken|earliest|früheste|plus tôt/i.test(message);

  if (!hasAvailability) return false;

  // Belirli saat verilmiş randevu talebi — müsaitlik listesi değil
  if (
    /\b(?:saat\s*)?\d{1,2}([:.]\d{2})?\s*(a|da)?\b/.test(n) &&
    !/hangi\s*saat|müsait|musait|uygun|boş|bos|en erken|available/i.test(n)
  ) {
    return false;
  }

  return true;
}

function resolveAvailabilityDateIso(
  history: HistoryMsg[],
  latestMessage: string,
  ctx: AppointmentCompanyContext
): string | null {
  const options = slotOptions(ctx);
  const messages = [...history, { sender_type: 'customer', message: latestMessage }];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.sender_type !== 'customer') continue;
    const slot = extractCustomerSlotFromConversation([m], m.message, options);
    if (slot) return slot.starts_at;
    const anchor = parseDateAnchorFromText(m.message, options);
    if (anchor) return anchor;
  }
  return null;
}

function slotOptions(ctx: AppointmentCompanyContext) {
  return { timezone: ctx.timezone, ref: ctx.parseRef };
}

function resolveCollectedSlot(
  history: HistoryMsg[],
  latestMessage: string,
  ctx: AppointmentCompanyContext
): ParsedSlot | null {
  const options = slotOptions(ctx);
  const fromCustomer = extractCustomerSlotFromConversation(history, latestMessage, options);
  if (fromCustomer) return fromCustomer;

  const fromAi = extractDateTimeFromRecentAiSummary(history, options);
  if (fromAi) {
    return buildSlotFromState(
      {
        status: 'collecting',
        customer_name: null,
        customer_phone: null,
        title: null,
        preferred_doctor: null,
        date: fromAi.date,
        time: fromAi.time,
      },
      ctx
    );
  }

  return null;
}

async function safeHasConflict(
  companyId: string,
  startsAt: string,
  endsAt: string
): Promise<{ occupied: boolean; error: boolean }> {
  try {
    logAppointmentEvent('check', { companyId, startsAt, endsAt });
    const occupied = await hasConflict(companyId, startsAt, endsAt);
    logAppointmentEvent('check_result', { companyId, startsAt, endsAt, occupied });
    return { occupied, error: false };
  } catch (err) {
    logAppointmentEvent('check_error', {
      companyId,
      startsAt,
      endsAt,
      error: (err as Error).message,
    });
    return { occupied: false, error: true };
  }
}

function isSlotInBreak(
  startMin: number,
  endMin: number,
  breaks: { start: string; end: string }[] | undefined
): boolean {
  for (const br of breaks || []) {
    const breakStart = parseHm(br.start);
    const breakEnd = parseHm(br.end);
    if (startMin < breakEnd && endMin > breakStart) return true;
  }
  return false;
}

/** Belirli bir gün için veritabanından doğrulanmış müsait saatler */
export async function listAvailableSlotsForDate(
  companyId: string,
  dateIso: string,
  ctx: AppointmentCompanyContext = DEFAULT_APPOINTMENT_CONTEXT,
  maxSlots = 15
): Promise<{ starts_at: string; ends_at: string }[]> {
  const timeZone = ctx.timezone;
  const parts = companyDateParts(new Date(dateIso), timeZone);
  const dayKey = weekdayToDayKey(slotWeekday(dateIso, timeZone));
  const daySchedule = ctx.schedule[dayKey];

  logAppointmentEvent('list_available', { companyId, dateIso, dayKey });

  if (!daySchedule) return [];

  const dayStart = localToUtcInTimezone(parts.year, parts.month, parts.day, 0, 0, timeZone);
  const dayEnd = localToUtcInTimezone(parts.year, parts.month, parts.day, 23, 59, timeZone);

  let appointments: Awaited<ReturnType<typeof listAppointments>>;
  try {
    appointments = await listAppointments(companyId, dayStart.toISOString(), dayEnd.toISOString());
  } catch (err) {
    logAppointmentEvent('list_available_error', { companyId, dateIso, error: (err as Error).message });
    throw err;
  }

  const openMin = parseHm(daySchedule.open);
  const closeMin = parseHm(daySchedule.close);
  const results: { starts_at: string; ends_at: string }[] = [];

  for (let cursorMin = openMin; cursorMin + SLOT_STEP_MINUTES <= closeMin; cursorMin += SLOT_STEP_MINUTES) {
    const endMin = cursorMin + SLOT_STEP_MINUTES;
    if (isSlotInBreak(cursorMin, endMin, daySchedule.breaks)) continue;

    const hour = Math.floor(cursorMin / 60);
    const minute = cursorMin % 60;
    const endHour = Math.floor(endMin / 60);
    const endMinute = endMin % 60;

    const starts_at = localToUtcInTimezone(
      parts.year,
      parts.month,
      parts.day,
      hour,
      minute,
      timeZone
    ).toISOString();
    const ends_at = localToUtcInTimezone(
      parts.year,
      parts.month,
      parts.day,
      endHour,
      endMinute,
      timeZone
    ).toISOString();

    const overlaps = appointments.some(
      (a) =>
        (a.status === 'pending' || a.status === 'confirmed') &&
        new Date(a.starts_at).getTime() < new Date(ends_at).getTime() &&
        new Date(a.ends_at).getTime() > new Date(starts_at).getTime()
    );

    if (!overlaps) {
      results.push({ starts_at, ends_at });
      if (results.length >= maxSlots) break;
    }
  }

  logAppointmentEvent('list_available_result', { companyId, dateIso, count: results.length });
  return results;
}

function formatAvailableSlotsList(
  slots: { starts_at: string; ends_at: string }[],
  lang: ConversationLang,
  timeZone: string
): string {
  if (slots.length === 0) {
    return t(lang, 'appointment_no_available_slots');
  }
  const lines = slots
    .map((s, i) => `${i + 1}) ${formatSlotLocalized(s.starts_at, s.ends_at, lang, timeZone)}`)
    .join('\n');
  return t(lang, 'appointment_available_slots', { slots: lines });
}

async function handleAvailabilityInquiry(
  companyId: string,
  history: HistoryMsg[],
  latestMessage: string,
  lang: ConversationLang,
  ctx: AppointmentCompanyContext
): Promise<AppointmentWorkflowResult> {
  const dateIso = resolveAvailabilityDateIso(history, latestMessage, ctx);

  if (!dateIso) {
    return {
      handled: true,
      message: t(lang, 'appointment_date_needed_for_availability'),
      appointment: null,
    };
  }

  try {
    const available = await listAvailableSlotsForDate(companyId, dateIso, ctx);
    const parts = companyDateParts(new Date(dateIso), ctx.timezone);
    const dateLabel = formatSlotLocalized(
      localToUtcInTimezone(parts.year, parts.month, parts.day, 9, 0, ctx.timezone).toISOString(),
      localToUtcInTimezone(parts.year, parts.month, parts.day, 9, 30, ctx.timezone).toISOString(),
      lang,
      ctx.timezone
    ).split(' ')[0];
    const list = formatAvailableSlotsList(available, lang, ctx.timezone);
    return {
      handled: true,
      message: t(lang, 'appointment_available_for_date', { date: dateLabel, slots: list }),
      appointment: null,
    };
  } catch {
    return {
      handled: true,
      message: t(lang, 'appointment_db_unavailable'),
      appointment: null,
    };
  }
}

async function tryCreateAppointment(
  companyId: string,
  merged: {
    customer_phone: string;
    customer_name: string;
    title: string;
    starts_at: string;
    ends_at: string;
    doctor_name?: string;
    preferred_doctor?: string;
  },
  lang: ConversationLang
): Promise<AppointmentWorkflowResult> {
  try {
    const category = await fetchCompanyCategory(companyId);
    const appointment = await bookAppointment(
      companyId,
      {
        customer_phone: merged.customer_phone,
        customer_name: merged.customer_name,
        title: merged.title,
        preferred_doctor: merged.doctor_name || merged.preferred_doctor || null,
        starts_at: merged.starts_at,
        ends_at: merged.ends_at,
        status: 'confirmed',
        source: 'ai',
      },
      lang
    );
    return {
      handled: true,
      message: buildAppointmentConfirmationMessage(appointment, lang, category),
      appointment,
    };
  } catch (err) {
    if (err instanceof AppointmentBookingError) {
      return {
        handled: true,
        message: err.message,
        appointment: null,
      };
    }
    logAppointmentEvent('create_error', { companyId, error: (err as Error).message });
    return {
      handled: true,
      message: t(lang, 'appointment_create_system_error'),
      appointment: null,
    };
  }
}

function isInitialAppointmentRequest(history: HistoryMsg[], latestMessage: string): boolean {
  const collected = parseCollectedFields(history, latestMessage);
  const hasAny =
    collected.customer_name ||
    collected.customer_phone ||
    collected.title ||
    collected.doctor_name;
  return !hasAny;
}

/**
 * Randevu modunda ana giriş — LLM yerine deterministik yanıt üretir.
 */
export async function runAppointmentWorkflow(
  companyId: string,
  customerPhone: string,
  history: HistoryMsg[],
  latestMessage: string,
  ctx: AppointmentCompanyContext = DEFAULT_APPOINTMENT_CONTEXT
): Promise<AppointmentWorkflowResult> {
  const lang = detectConversationLanguage(latestMessage, history);

  if (isAppointmentStatusInquiry(latestMessage)) {
    return handleAppointmentStatusInquiry(companyId, customerPhone, lang, ctx);
  }

  const collected = parseCollectedFields(history, latestMessage);
  const slot = resolveCollectedSlot(history, latestMessage, ctx);

  if (isAvailabilityInquiry(latestMessage)) {
    const missingForAvailability = getMissingRequiredFields(
      collected,
      undefined,
      history,
      latestMessage,
      ctx
    ).filter((f) => f !== 'datetime');

    if (missingForAvailability.length === 0) {
      return handleAvailabilityInquiry(companyId, history, latestMessage, lang, ctx);
    }
  }

  const missing = getMissingRequiredFields(collected, undefined, history, latestMessage, ctx);

  if (missing.length > 0) {
    if (isInitialAppointmentRequest(history, latestMessage)) {
      return {
        handled: true,
        message: buildAllRequiredFieldsMessage(lang),
        appointment: null,
      };
    }
    const message =
      missing.length === 1
        ? promptForMissingField(missing[0], lang)
        : buildMissingFieldsMessage(missing, lang);
    return {
      handled: true,
      message,
      appointment: null,
    };
  }

  if (!slot) {
    return {
      handled: true,
      message: t(lang, 'appointment_datetime_required'),
      appointment: null,
    };
  }

  const hours = validateSlotWorkingHours(slot, ctx, lang);
  if (!hours.valid) {
    return {
      handled: true,
      message: buildWorkingHoursRejectionMessage(hours, ctx, lang),
      appointment: null,
    };
  }

  const merged = mergeCollectedWithAction(collected, {
    starts_at: slot.starts_at,
    ends_at: slot.ends_at,
    customer_phone: collected.customer_phone || customerPhone,
  });

  const confirmed = isAppointmentConfirmation(latestMessage, history);

  if (!confirmed) {
    const { occupied, error } = await safeHasConflict(companyId, slot.starts_at, slot.ends_at);

    if (error) {
      return {
        handled: true,
        message: t(lang, 'appointment_db_unavailable'),
        appointment: null,
      };
    }

    if (occupied) {
      return {
        handled: true,
        message: t(lang, 'appointment_slot_occupied'),
        appointment: null,
      };
    }

    const slotLabel = formatSlotLocalized(slot.starts_at, slot.ends_at, lang, ctx.timezone);
    const phoneDisplay = merged.customer_phone.replace(
      /(\d{2})(\d{3})(\d{3})(\d{2})(\d{2})/,
      '$2 $3 $4 $5'
    );
    return {
      handled: true,
      message: t(lang, 'appointment_confirm_prompt', {
        slot: slotLabel,
        name: merged.customer_name,
        title: merged.title,
        phone: phoneDisplay.length >= 10 ? phoneDisplay : merged.customer_phone,
      }),
      appointment: null,
    };
  }

  return tryCreateAppointment(companyId, merged, lang);
}
