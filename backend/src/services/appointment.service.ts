/**
 * Randevu iş mantığı — veritabanı CRUD ve doğrulama.
 * Müsaitlik ve kayıt yalnızca deterministik workflow üzerinden yapılır.
 */

import { adminClient } from '../database/supabase';
import { Appointment, AppointmentSource, AppointmentStatus } from '../types';
import {
  formatSlotLocalized,
  validateSlotWorkingHours,
  buildWorkingHoursRejectionMessage,
} from '../ai/appointment-slot.service';
import { isValidFullName, isValidProcedureTitle } from '../ai/appointment-collect.service';
import { ConversationLang, t, getAppointmentProviderLabel } from '../ai/language.service';
import { buildAppointmentCompanyContext } from '../ai/appointment-company-context';
import {
  shouldAskAppointmentProvider,
  isGenericAppointmentTitle,
} from './appointment-category.service';

export type AppointmentBookingErrorCode =
  | 'validation'
  | 'conflict'
  | 'working_hours'
  | 'database';

export class AppointmentBookingError extends Error {
  readonly code: AppointmentBookingErrorCode;

  constructor(message: string, code: AppointmentBookingErrorCode) {
    super(message);
    this.name = 'AppointmentBookingError';
    this.code = code;
  }
}

export function logAppointmentEvent(
  action: string,
  details: Record<string, unknown>
): void {
  console.log(`[Randevu:${action}]`, JSON.stringify({ ...details, ts: new Date().toISOString() }));
}

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

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
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

async function insertAppointmentRecord(
  companyId: string,
  input: AppointmentInput
): Promise<Appointment> {
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

/**
 * Tek randevu iş kuralı girişi — panel ve WhatsApp workflow buradan geçer.
 * Sıra: alan doğrulama → çalışma saati → hasConflict → INSERT
 */
export async function bookAppointment(
  companyId: string,
  input: AppointmentInput,
  lang: ConversationLang = 'tr'
): Promise<Appointment> {
  logAppointmentEvent('book_attempt', {
    companyId,
    startsAt: input.starts_at,
    phone: input.customer_phone,
    source: input.source || 'panel',
  });

  const validationError = validateAppointmentAction(
    {
      customer_name: input.customer_name ?? undefined,
      customer_phone: input.customer_phone,
      title: input.title,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
    },
    input.customer_phone,
    lang
  );
  if (validationError) {
    throw new AppointmentBookingError(validationError, 'validation');
  }

  const { data: companyRow } = await adminClient
    .from('companies')
    .select('working_hours, timezone')
    .eq('id', companyId)
    .maybeSingle();

  const ctx = buildAppointmentCompanyContext(companyRow?.working_hours, companyRow?.timezone);
  const hoursCheck = validateSlotWorkingHours(
    { starts_at: input.starts_at, ends_at: input.ends_at },
    ctx,
    lang
  );
  if (!hoursCheck.valid) {
    throw new AppointmentBookingError(
      buildWorkingHoursRejectionMessage(hoursCheck, ctx, lang),
      'working_hours'
    );
  }

  let conflict: boolean;
  try {
    conflict = await hasConflict(companyId, input.starts_at, input.ends_at);
  } catch (err) {
    logAppointmentEvent('book_db_error', {
      companyId,
      error: (err as Error).message,
    });
    throw new AppointmentBookingError(t(lang, 'appointment_db_unavailable'), 'database');
  }

  if (conflict) {
    logAppointmentEvent('book_conflict', { companyId, startsAt: input.starts_at });
    throw new AppointmentBookingError(t(lang, 'appointment_slot_occupied'), 'conflict');
  }

  try {
    const appointment = await insertAppointmentRecord(companyId, input);
    logAppointmentEvent('book_success', { companyId, appointmentId: appointment.id });
    return appointment;
  } catch (err) {
    const errMsg = (err as Error).message;
    logAppointmentEvent('book_insert_error', { companyId, error: errMsg });
    if (/başka bir randevu|çakışma|duplicate|unique/i.test(errMsg)) {
      throw new AppointmentBookingError(t(lang, 'appointment_slot_occupied'), 'conflict');
    }
    throw new AppointmentBookingError(t(lang, 'appointment_create_system_error'), 'database');
  }
}

/** @deprecated bookAppointment kullanın — geriye dönük uyumluluk */
export async function createAppointment(
  companyId: string,
  input: AppointmentInput
): Promise<Appointment> {
  return bookAppointment(companyId, input);
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
