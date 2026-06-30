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
  stripAppointmentMarkers,
} from '../services/appointment.service';
import { Appointment } from '../types';
import {
  blockBookingIfIncomplete,
  mergeCollectedWithAction,
  parseCollectedFields,
  HistoryMsg,
} from './appointment-collect.service';
import {
  extractOfferedSlotFromHistory,
  formatSlotTurkish,
  preferHistorySlot,
} from './appointment-slot.service';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

const CONFIRM_RE = /^(evet|onayl?[iıİI]yorum|onaylıyorum|onayliyorum|onay|tamam|uygun|olur|kabul|ok|yes)\b/iu;

export function isAppointmentConfirmation(message: string): boolean {
  return CONFIRM_RE.test(message.trim());
}

export async function extractAppointmentFromConversation(
  history: HistoryMsg[],
  latestMessage: string
): Promise<ParsedAppointmentAction | null> {
  const transcript = history
    .slice(-14)
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
        content: `Konuşmadan randevu bilgilerini çıkar. JSON:
{"customer_name":"","customer_phone":"","title":"","doctor_name":"","notes":"","starts_at":"ISO8601","ends_at":"ISO8601","ready":false}
ready:true YALNIZCA şunların HEPSİ konuşmada açıkça varsa:
- Ad VE soyad (iki kelime)
- Cep telefonu (10+ hane)
- İşlem/muayene özeti
- Müşteri onayladı
- Geçerli gelecek tarih/saat
Eksik varsa ready:false`,
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

async function persistAppointment(
  companyId: string,
  merged: {
    customer_phone: string;
    customer_name: string;
    title: string;
    notes?: string;
    doctor_name?: string;
    preferred_doctor?: string;
    starts_at: string;
    ends_at: string;
  }
): Promise<{ message: string; appointment: Appointment }> {
  const appointment = await createAppointment(companyId, {
    customer_phone: merged.customer_phone,
    customer_name: merged.customer_name,
    title: merged.title,
    notes: merged.notes || null,
    preferred_doctor: merged.doctor_name || merged.preferred_doctor || null,
    starts_at: new Date(merged.starts_at).toISOString(),
    ends_at: new Date(merged.ends_at).toISOString(),
    status: 'confirmed',
    source: 'ai',
  });

  const slot = formatSlotTurkish(appointment.starts_at, appointment.ends_at);
  return {
    message: `Randevunuz kaydedildi: ${slot}. ${appointment.title}`,
    appointment,
  };
}

/** Onay mesajında konuşmadaki teklif saatini kullanarak kaydet */
export async function bookFromConfirmation(
  companyId: string,
  customerPhone: string,
  history: HistoryMsg[],
  latestMessage: string
): Promise<{ message: string; appointment: Appointment | null } | null> {
  if (!isAppointmentConfirmation(latestMessage)) return null;

  const collected = parseCollectedFields(history, latestMessage);
  const gate = blockBookingIfIncomplete(history, latestMessage);
  if (gate.blocked) {
    return { message: gate.message!, appointment: null };
  }

  const offered = extractOfferedSlotFromHistory(history);
  if (!offered) return null;

  const merged = mergeCollectedWithAction(collected, {
    starts_at: offered.starts_at,
    ends_at: offered.ends_at,
  } as ParsedAppointmentAction);

  const err = validateAppointmentAction(merged, customerPhone);
  if (err) return { message: err, appointment: null };

  try {
    return await persistAppointment(companyId, merged);
  } catch (e) {
    return { message: `Randevu kaydedilemedi: ${(e as Error).message}`, appointment: null };
  }
}

export async function tryStructuredAppointmentBooking(
  companyId: string,
  customerPhone: string,
  history: HistoryMsg[],
  latestMessage: string
): Promise<{ message: string; appointment: Appointment | null } | null> {
  if (!isAppointmentConfirmation(latestMessage)) return null;

  const fromHistory = await bookFromConfirmation(companyId, customerPhone, history, latestMessage);
  if (fromHistory?.appointment) return fromHistory;

  const extracted = await extractAppointmentFromConversation(history, latestMessage);
  if (!extracted) return fromHistory;

  const gate = blockBookingIfIncomplete(history, latestMessage, extracted);
  if (gate.blocked) {
    return { message: gate.message!, appointment: null };
  }

  const slot = preferHistorySlot(history, extracted);
  if (!slot) return fromHistory;

  const merged = mergeCollectedWithAction(gate.collected, { ...extracted, ...slot });

  const err = validateAppointmentAction(merged, customerPhone);
  if (err) return { message: err, appointment: null };

  try {
    return await persistAppointment(companyId, merged);
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
  if (isAppointmentConfirmation(latestMessage)) {
    const confirmed = await bookFromConfirmation(companyId, customerPhone, history, latestMessage);
    if (confirmed?.appointment) return confirmed;
  }

  const action = rawResponse.includes(APPOINTMENT_MARKER)
    ? (() => {
        try {
          const m = rawResponse.match(/\[APPOINTMENT\]([\s\S]*?)\[\/APPOINTMENT\]/i);
          return m ? (JSON.parse(m[1].trim()) as ParsedAppointmentAction) : undefined;
        } catch {
          return undefined;
        }
      })()
    : undefined;

  const gate = blockBookingIfIncomplete(history, latestMessage, action);
  if (gate.blocked && !isAppointmentConfirmation(latestMessage)) {
    return { message: gate.message!, appointment: null };
  }

  const fromMarker = await processAIAppointmentBooking(
    companyId,
    customerPhone,
    null,
    rawResponse,
    gate.collected,
    history
  );
  if (fromMarker.appointment) return fromMarker;

  if (rawResponse.includes(APPOINTMENT_MARKER) || isAppointmentConfirmation(latestMessage)) {
    const structured = await tryStructuredAppointmentBooking(
      companyId,
      customerPhone,
      history,
      latestMessage
    );
    if (structured) return structured;
  }

  if (gate.blocked && gate.message) {
    return { message: gate.message, appointment: null };
  }

  return fromMarker;
}
