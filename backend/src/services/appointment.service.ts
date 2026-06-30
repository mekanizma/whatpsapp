/**
 * Randevu iş mantığı ve AI takvim entegrasyonu
 */

import { adminClient } from '../database/supabase';
import { Appointment, AppointmentSource, AppointmentStatus } from '../types';

const APPOINTMENT_BLOCK_RE = /\[APPOINTMENT\]([\s\S]*?)\[\/APPOINTMENT\]/gi;
const FALSE_SUCCESS_RE = /randevu(nuz)?\s+(başarıyla\s+|basariyla\s+)?(oluşturuldu|olusturuldu|alındı|alindi|onaylandı|onaylandi|kaydedildi)/i;

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

function formatSlot(start: Date, end: Date, locale = 'tr-TR'): string {
  const day = start.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const t1 = start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const t2 = end.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
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

export function validateAppointmentAction(
  action: ParsedAppointmentAction,
  fallbackPhone: string
): string | null {
  if (!action.customer_name?.trim()) {
    return 'Ad soyad bilgisi eksik. Lütfen adınızı ve soyadınızı yazın.';
  }
  const phone = normalizePhone(action.customer_phone?.trim() || fallbackPhone);
  if (!phone || phone.length < 10) {
    return 'Geçerli bir cep telefonu numarası gerekli.';
  }
  if (!action.title?.trim()) {
    return 'Yapılacak işlem özeti eksik. Lütfen randevu konusunu kısaca yazın.';
  }
  if (!action.starts_at || !action.ends_at) {
    return 'Randevu tarih ve saati eksik.';
  }
  const start = new Date(action.starts_at);
  const end = new Date(action.ends_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return 'Randevu saati geçersiz.';
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

export async function createAppointment(
  companyId: string,
  input: AppointmentInput
): Promise<Appointment> {
  const conflict = await hasConflict(companyId, input.starts_at, input.ends_at);
  if (conflict) {
    throw new Error('Bu saat aralığında başka bir randevu var.');
  }

  const { data, error } = await adminClient
    .from('appointments')
    .insert({
      company_id: companyId,
      customer_phone: normalizePhone(input.customer_phone),
      customer_name: input.customer_name?.trim() || null,
      title: input.title || 'Randevu',
      notes: input.notes || null,
      preferred_doctor: input.preferred_doctor?.trim() || null,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      status: input.status || 'confirmed',
      source: input.source || 'panel',
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

  if (items.length === 0) {
    return 'Önümüzdeki 14 günde kayıtlı randevu yok. Müsait saatleri bilgi bankası çalışma saatlerine göre öner.';
  }

  const lines = items.slice(0, 25).map((a) => {
    const start = new Date(a.starts_at);
    const end = new Date(a.ends_at);
    const who = a.customer_name || a.customer_phone;
    const doctor = a.preferred_doctor ? ` | Doktor: ${a.preferred_doctor}` : '';
    return `- ${formatSlot(start, end)}: ${who} — ${a.title}${doctor} [${a.status}]`;
  });

  const more = items.length > 25 ? `\n... ve ${items.length - 25} randevu daha` : '';
  return `DOLU SAATLER (çakışma yapma):\n${lines.join('\n')}${more}`;
}

export function stripAppointmentMarkers(text: string): string {
  return text.replace(APPOINTMENT_BLOCK_RE, '').replace(/\s+/g, ' ').trim();
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
  hadMarker: boolean
): string {
  if (appointment) return message;

  const claimsSuccess = FALSE_SUCCESS_RE.test(message);
  if (!claimsSuccess) return message;

  if (hadMarker) {
    return 'Randevu kaydı tamamlanamadı. Lütfen ad soyad, cep telefonu ve işlem özetinizi tekrar paylaşır mısınız?';
  }

  return message.replace(
    FALSE_SUCCESS_RE,
    'randevu bilgilerinizi aldım, kayıt için onayınızı bekliyorum'
  );
}

export async function processAIAppointmentBooking(
  companyId: string,
  customerPhone: string,
  customerName: string | null,
  rawResponse: string
): Promise<{ message: string; appointment: Appointment | null }> {
  const hadMarker = rawResponse.includes(APPOINTMENT_MARKER);
  const action = parseAppointmentAction(rawResponse);
  let message = stripAppointmentMarkers(rawResponse);

  if (!action) {
    message = fixFalseSuccessMessage(message, null, hadMarker);
    if (hadMarker && !action) {
      console.error('[Randevu] Marker var ama JSON okunamadı — token kesilmiş olabilir');
    }
    return { message, appointment: null };
  }

  const mergedAction: ParsedAppointmentAction = {
    ...action,
    customer_name: action.customer_name?.trim() || customerName?.trim() || undefined,
    customer_phone: action.customer_phone?.trim() || customerPhone,
  };

  const validationError = validateAppointmentAction(mergedAction, customerPhone);
  if (validationError) {
    console.warn('[Randevu] Doğrulama hatası:', validationError);
    return {
      message: validationError,
      appointment: null,
    };
  }

  try {
    const appointment = await createAppointment(companyId, {
      customer_phone: mergedAction.customer_phone || customerPhone,
      customer_name: mergedAction.customer_name!.trim(),
      title: mergedAction.title!.trim(),
      notes: buildNotes(mergedAction),
      preferred_doctor: getDoctorName(mergedAction),
      starts_at: new Date(mergedAction.starts_at).toISOString(),
      ends_at: new Date(mergedAction.ends_at).toISOString(),
      status: 'confirmed',
      source: 'ai',
    });

    const start = new Date(appointment.starts_at);
    const doctorPart = appointment.preferred_doctor ? ` Doktor: ${appointment.preferred_doctor}.` : '';
    const confirmMsg = `Randevunuz kaydedildi: ${formatSlot(start, new Date(appointment.ends_at))}.${doctorPart} ${appointment.title}`;

    if (!message || FALSE_SUCCESS_RE.test(message)) {
      message = confirmMsg;
    }

    console.log(`[Randevu] Oluşturuldu: ${appointment.id} | ${appointment.customer_name} | ${appointment.title}`);
    return { message, appointment };
  } catch (err) {
    const errMsg = (err as Error).message;
    console.error('[Randevu] Kayıt hatası:', errMsg);
    return {
      message: `Randevu kaydedilemedi: ${errMsg} Lütfen başka bir saat önerin.`,
      appointment: null,
    };
  }
}
