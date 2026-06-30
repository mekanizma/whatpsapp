/**
 * Randevu iş mantığı ve AI takvim entegrasyonu
 */

import { adminClient } from '../database/supabase';
import { Appointment, AppointmentSource, AppointmentStatus } from '../types';

const APPOINTMENT_BLOCK_RE = /\[APPOINTMENT\]([\s\S]*?)\[\/APPOINTMENT\]/gi;

export const APPOINTMENT_MARKER = '[APPOINTMENT]';

export interface AppointmentInput {
  customer_phone: string;
  customer_name?: string | null;
  title?: string;
  notes?: string | null;
  starts_at: string;
  ends_at: string;
  status?: AppointmentStatus;
  source?: AppointmentSource;
}

export interface ParsedAppointmentAction {
  starts_at: string;
  ends_at: string;
  title?: string;
  notes?: string;
}

function formatSlot(start: Date, end: Date, locale = 'tr-TR'): string {
  const day = start.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const t1 = start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const t2 = end.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return `${day} ${t1}-${t2}`;
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
    .lte('starts_at', to)
    .neq('status', 'cancelled')
    .order('starts_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as Appointment[];
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
      customer_phone: input.customer_phone,
      customer_name: input.customer_name || null,
      title: input.title || 'Randevu',
      notes: input.notes || null,
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

  const { data, error } = await adminClient
    .from('appointments')
    .update(updates)
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
    return `- ${formatSlot(start, end)}: ${who} — ${a.title} [${a.status}]`;
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

  try {
    const parsed = JSON.parse(match[1].trim()) as ParsedAppointmentAction;
    if (!parsed.starts_at || !parsed.ends_at) return null;
    const start = new Date(parsed.starts_at);
    const end = new Date(parsed.ends_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function processAIAppointmentBooking(
  companyId: string,
  customerPhone: string,
  customerName: string | null,
  rawResponse: string
): Promise<{ message: string; appointment: Appointment | null }> {
  const action = parseAppointmentAction(rawResponse);
  let message = stripAppointmentMarkers(rawResponse);

  if (!action) {
    return { message, appointment: null };
  }

  try {
    const appointment = await createAppointment(companyId, {
      customer_phone: customerPhone,
      customer_name: customerName,
      title: action.title || 'Randevu',
      notes: action.notes || null,
      starts_at: new Date(action.starts_at).toISOString(),
      ends_at: new Date(action.ends_at).toISOString(),
      status: 'confirmed',
      source: 'ai',
    });

    if (!message) {
      const start = new Date(appointment.starts_at);
      message = `Randevunuz kaydedildi: ${formatSlot(start, new Date(appointment.ends_at))}.`;
    }

    return { message, appointment };
  } catch (err) {
    const errMsg = (err as Error).message;
    if (!message) {
      message = `Randevu kaydedilemedi: ${errMsg}. Lütfen başka bir saat önerin.`;
    }
    return { message, appointment: null };
  }
}
