/**
 * Randevu LLM yapılandırılmış JSON yanıtını parse eder
 */

import {
  type AppointmentAction,
  type AppointmentResponsePayload,
  APPOINTMENT_ACTIONS,
} from './appointment-response-schema';
import type { AppointmentLlmState } from './appointment-state.service';

export interface ParsedAppointmentResponse {
  payload: AppointmentResponsePayload | null;
  parseError: boolean;
}

function normalizeNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return String(value).trim() || null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') return null;
  return trimmed;
}

function normalizeAction(value: unknown): AppointmentAction | null {
  if (typeof value !== 'string') return null;
  const lower = value.trim().toLowerCase();
  return (APPOINTMENT_ACTIONS as readonly string[]).includes(lower)
    ? (lower as AppointmentAction)
    : null;
}

export function parseAppointmentResponse(raw: string): ParsedAppointmentResponse {
  const trimmed = raw.trim();
  if (!trimmed) return { payload: null, parseError: true };

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return { payload: null, parseError: true };

    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
    const action = normalizeAction(parsed.action);
    const apptRaw = parsed.appointment;

    if (!reply || !action || !apptRaw || typeof apptRaw !== 'object') {
      return { payload: null, parseError: true };
    }

    const appt = apptRaw as Record<string, unknown>;
    return {
      payload: {
        reply,
        action,
        appointment: {
          name: normalizeNullableString(appt.name),
          phone: normalizeNullableString(appt.phone),
          topic: normalizeNullableString(appt.topic),
          date: normalizeNullableString(appt.date),
          time: normalizeNullableString(appt.time),
        },
      },
      parseError: false,
    };
  } catch {
    return { payload: null, parseError: true };
  }
}

export function stateFromAppointmentResponse(
  appointment: AppointmentResponsePayload['appointment']
): AppointmentLlmState {
  return {
    status: 'collecting',
    customer_name: appointment.name,
    customer_phone: appointment.phone,
    title: appointment.topic,
    preferred_doctor: null,
    date: appointment.date,
    time: appointment.time,
  };
}

export function maskPhoneForLog(phone: string | null | undefined): string {
  if (!phone) return 'null';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

export function formatSystemNotePrefix(note: string): string {
  return `[SISTEM NOTU: ${note.trim()}]`;
}
