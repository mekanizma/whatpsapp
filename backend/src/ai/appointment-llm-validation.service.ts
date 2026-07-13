/**
 * LLM randevu state doğrulama — tarih/saat format, geçmiş, MAX_DAYS_AHEAD
 */

import { appointmentConfig } from '../config/appointment.config';
import type { AppointmentCompanyContext } from './appointment-company-context';
import {
  localToUtcInTimezone,
  validateSlotWorkingHours,
  type ParsedSlot,
} from './appointment-slot.service';
import type { AppointmentLlmState } from './appointment-state.service';
import { ConversationLang } from './language.service';
import { getStartOfTodayInTimezone } from '../services/company-timezone.service';
import { isValidFullName, isValidProcedureTitle } from './appointment-collect.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;

export type AppointmentValidationCode = 'INVALID_DATE' | 'INCOMPLETE' | 'INVALID_FIELDS';

export interface AppointmentValidationResult {
  valid: boolean;
  code?: AppointmentValidationCode;
  slot?: ParsedSlot;
}

function parseHm(time: string): { hour: number; minute: number } | null {
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function parseIsoDate(date: string): { year: number; month: number; day: number } | null {
  if (!DATE_RE.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function buildSlotFromState(
  state: AppointmentLlmState,
  ctx: AppointmentCompanyContext
): ParsedSlot | null {
  if (!state.date || !state.time) return null;
  const dateParts = parseIsoDate(state.date);
  const timeParts = parseHm(state.time);
  if (!dateParts || !timeParts) return null;

  const start = localToUtcInTimezone(
    dateParts.year,
    dateParts.month,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
    ctx.timezone
  );
  const end = new Date(start.getTime() + appointmentConfig.slotDurationMinutes * 60_000);
  return { starts_at: start.toISOString(), ends_at: end.toISOString() };
}

export function validateAppointmentDateTime(
  state: AppointmentLlmState,
  ctx: AppointmentCompanyContext,
  lang: ConversationLang = 'tr'
): AppointmentValidationResult {
  if (!state.date || !state.time) {
    return { valid: false, code: 'INCOMPLETE' };
  }

  if (!DATE_RE.test(state.date) || !TIME_RE.test(state.time)) {
    return { valid: false, code: 'INVALID_DATE' };
  }

  const dateParts = parseIsoDate(state.date);
  const timeParts = parseHm(state.time);
  if (!dateParts || !timeParts) {
    return { valid: false, code: 'INVALID_DATE' };
  }

  const slot = buildSlotFromState(state, ctx);
  if (!slot) {
    return { valid: false, code: 'INVALID_DATE' };
  }

  const now = ctx.parseRef || new Date();
  const startMs = new Date(slot.starts_at).getTime();
  if (startMs < now.getTime()) {
    return { valid: false, code: 'INVALID_DATE' };
  }

  const todayStart = getStartOfTodayInTimezone(ctx.timezone, now);
  const maxDate = new Date(todayStart);
  maxDate.setDate(maxDate.getDate() + appointmentConfig.maxDaysAhead);
  if (startMs > maxDate.getTime()) {
    return { valid: false, code: 'INVALID_DATE' };
  }

  const hoursCheck = validateSlotWorkingHours(slot, ctx, lang);
  if (!hoursCheck.valid) {
    return { valid: false, code: 'INVALID_DATE' };
  }

  return { valid: true, slot };
}

export function validateAppointmentFields(state: AppointmentLlmState): boolean {
  if (!state.customer_name || !isValidFullName(state.customer_name)) return false;
  const phone = (state.customer_phone || '').replace(/\D/g, '');
  if (!phone || phone.length < 10) return false;
  if (!state.title || !isValidProcedureTitle(state.title)) return false;
  return true;
}

export function hasCompleteAppointmentFields(state: AppointmentLlmState): boolean {
  return validateAppointmentFields(state) && !!state.date && !!state.time;
}

export function isReadyForBooking(state: AppointmentLlmState): boolean {
  return hasCompleteAppointmentFields(state);
}
