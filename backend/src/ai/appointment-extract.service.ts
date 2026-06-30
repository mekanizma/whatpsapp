/**
 * Randevu — yapılandırılmış çıkarma ile güvenilir kayıt
 */

import OpenAI from 'openai';
import { config } from '../config';
import {
  ParsedAppointmentAction,
  processAIAppointmentBooking,
  validateAppointmentAction,
  createAppointment,
  APPOINTMENT_MARKER,
} from '../services/appointment.service';
import { Appointment } from '../types';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

const CONFIRM_RE = /^(evet|onayl?iyorum|onay|tamam|uygun|olur|kabul|ok|yes)\b/i;

export function isAppointmentConfirmation(message: string): boolean {
  return CONFIRM_RE.test(message.trim());
}

interface HistoryMsg {
  sender_type: string;
  message: string;
}

export async function extractAppointmentFromConversation(
  history: HistoryMsg[],
  latestMessage: string
): Promise<ParsedAppointmentAction | null> {
  const transcript = history
    .slice(-12)
    .map((m) => `${m.sender_type === 'customer' ? 'Müşteri' : 'Asistan'}: ${m.message}`)
    .join('\n');

  const completion = await openai.chat.completions.create({
    model: config.openai.model,
    temperature: 0,
    max_tokens: 400,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Konuşmadan onaylanmış randevu bilgilerini çıkar. JSON döndür:
{"customer_name":"","customer_phone":"","title":"","doctor_name":"","notes":"","starts_at":"ISO8601","ends_at":"ISO8601","ready":true}
- ready: false ise eksik bilgi var
- starts_at/ends_at UTC ISO format (Türkiye saati UTC+3; örn 10:00 TR = 07:00Z)
- Geçmiş tarih kullanma
- Sadece müşteri onayladıysa ready:true`,
      },
      {
        role: 'user',
        content: `${transcript}\nMüşteri: ${latestMessage}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as ParsedAppointmentAction & { ready?: boolean };
    if (!parsed.ready || !parsed.starts_at || !parsed.ends_at) return null;
    const start = new Date(parsed.starts_at);
    const end = new Date(parsed.ends_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
    if (start.getTime() < Date.now() - 60_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function tryStructuredAppointmentBooking(
  companyId: string,
  customerPhone: string,
  customerName: string | null,
  history: HistoryMsg[],
  latestMessage: string
): Promise<{ message: string; appointment: Appointment | null } | null> {
  if (!isAppointmentConfirmation(latestMessage)) return null;

  const extracted = await extractAppointmentFromConversation(history, latestMessage);
  if (!extracted) return null;

  const merged: ParsedAppointmentAction = {
    ...extracted,
    customer_name: extracted.customer_name?.trim() || customerName?.trim() || undefined,
    customer_phone: extracted.customer_phone?.trim() || customerPhone,
  };

  const err = validateAppointmentAction(merged, customerPhone);
  if (err) return { message: err, appointment: null };

  try {
    const appointment = await createAppointment(companyId, {
      customer_phone: merged.customer_phone || customerPhone,
      customer_name: merged.customer_name!,
      title: merged.title!,
      notes: merged.notes || null,
      preferred_doctor: merged.doctor_name || merged.preferred_doctor || null,
      starts_at: new Date(merged.starts_at).toISOString(),
      ends_at: new Date(merged.ends_at).toISOString(),
      status: 'confirmed',
      source: 'ai',
    });

    const start = new Date(appointment.starts_at);
    const day = start.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const t1 = start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const t2 = new Date(appointment.ends_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    return {
      message: `Randevunuz kaydedildi: ${day} ${t1}-${t2}. ${appointment.title}`,
      appointment,
    };
  } catch (e) {
    return { message: `Randevu kaydedilemedi: ${(e as Error).message}`, appointment: null };
  }
}

/** Marker tabanlı işleme + yapılandırılmış yedek */
export async function handleAppointmentBooking(
  companyId: string,
  customerPhone: string,
  customerName: string | null,
  rawResponse: string,
  history: HistoryMsg[],
  latestMessage: string
): Promise<{ message: string; appointment: Appointment | null }> {
  const fromMarker = await processAIAppointmentBooking(
    companyId,
    customerPhone,
    customerName,
    rawResponse
  );
  if (fromMarker.appointment) return fromMarker;

  if (rawResponse.includes(APPOINTMENT_MARKER) || isAppointmentConfirmation(latestMessage)) {
    const structured = await tryStructuredAppointmentBooking(
      companyId,
      customerPhone,
      customerName,
      history,
      latestMessage
    );
    if (structured) return structured;
  }

  return fromMarker;
}
