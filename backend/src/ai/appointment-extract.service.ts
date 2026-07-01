/**
 * Randevu — yapılandırılmış çıkarma ile güvenilir kayıt
 */

import { createChatCompletion } from './openai-client';
import {
  ParsedAppointmentAction,
  processAIAppointmentBooking,
  validateAppointmentAction,
  createAppointment,
  APPOINTMENT_MARKER,
  buildAppointmentConfirmationMessage,
  finalizeCustomerFacingMessage,
  buildConflictMessageWithAlternatives,
  hasConflict,
} from '../services/appointment.service';
import { Appointment } from '../types';
import {
  blockBookingIfIncomplete,
  mergeCollectedWithAction,
  parseCollectedFields,
  HistoryMsg,
} from './appointment-collect.service';
import { extractSlotForConfirmation, preferHistorySlot, extractNumberedAlternative } from './appointment-slot.service';
import { ConversationLang, detectConversationLanguage } from './language.service';

const CONFIRM_RE = /^(evet|onayl?[iıİI]yorum|onaylıyorum|onayliyorum|onay|tamam|uygun|olur|kabul|ok|yes)\b/iu;

export function isAppointmentConfirmation(message: string): boolean {
  return CONFIRM_RE.test(message.trim());
}

function isAlternativeSlotSelection(history: HistoryMsg[], latestMessage: string): boolean {
  return /^\s*[123]\s*$/.test(latestMessage.trim()) && !!extractNumberedAlternative(history, latestMessage);
}

export async function extractAppointmentFromConversation(
  history: HistoryMsg[],
  latestMessage: string,
  companyId?: string,
  customerPhone?: string
): Promise<ParsedAppointmentAction | null> {
  const transcript = history
    .slice(-14)
    .map((m) => `${m.sender_type === 'customer' ? 'Müşteri' : 'Asistan'}: ${m.message}`)
    .join('\n');

  const completion = await createChatCompletion(
    [
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
    {
      maxTokens: 400,
      temperature: 0,
      responseFormat: { type: 'json_object' },
      ...(companyId
        ? {
            usageLog: {
              companyId,
              customerPhone: customerPhone || '',
              skipped: false,
              cached: false,
              skipReason: 'appointment_extract',
            },
          }
        : {}),
    }
  );

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
  },
  lang: ConversationLang = 'tr'
): Promise<{ message: string; appointment: Appointment | null }> {
  const conflict = await hasConflict(companyId, merged.starts_at, merged.ends_at);
  if (conflict) {
    const altMsg = await buildConflictMessageWithAlternatives(
      companyId,
      merged.starts_at,
      merged.ends_at,
      lang
    );
    return { message: altMsg, appointment: null };
  }

  try {
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

    return {
      message: buildAppointmentConfirmationMessage(appointment, lang),
      appointment,
    };
  } catch (e) {
    const errMsg = (e as Error).message;
    if (/başka bir randevu|çakışma/i.test(errMsg)) {
      const altMsg = await buildConflictMessageWithAlternatives(
        companyId,
        merged.starts_at,
        merged.ends_at,
        lang
      );
      return { message: altMsg, appointment: null };
    }
    return { message: `Randevu kaydedilemedi: ${errMsg}`, appointment: null };
  }
}

/** Onay mesajında konuşmadaki teklif saatini kullanarak kaydet */
export async function bookFromConfirmation(
  companyId: string,
  customerPhone: string,
  history: HistoryMsg[],
  latestMessage: string
): Promise<{ message: string; appointment: Appointment | null } | null> {
  if (!isAppointmentConfirmation(latestMessage) && !isAlternativeSlotSelection(history, latestMessage)) {
    return null;
  }

  const lang = detectConversationLanguage(latestMessage, history);
  const collected = parseCollectedFields(history, latestMessage);
  const gate = blockBookingIfIncomplete(history, latestMessage, undefined, lang);
  if (gate.blocked) {
    return { message: gate.message!, appointment: null };
  }

  const offered = extractSlotForConfirmation(history, latestMessage);
  if (!offered) {
    return {
      message:
        lang === 'tr'
          ? 'Randevu saatini anlayamadım. Lütfen tarih ve saati tekrar yazın (ör. "15 temmuz saat 14:00" veya "yarın saat 10").'
          : 'I could not understand the appointment time. Please write the date and time again.',
      appointment: null,
    };
  }

  const merged = mergeCollectedWithAction(collected, {
    starts_at: offered.starts_at,
    ends_at: offered.ends_at,
  } as ParsedAppointmentAction);

  const err = validateAppointmentAction(merged, customerPhone);
  if (err) return { message: err, appointment: null };

  try {
    return await persistAppointment(companyId, merged, lang);
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

  const lang = detectConversationLanguage(latestMessage, history);
  const fromHistory = await bookFromConfirmation(companyId, customerPhone, history, latestMessage);
  if (fromHistory?.appointment) return fromHistory;

  const extracted = await extractAppointmentFromConversation(history, latestMessage, companyId, customerPhone);
  if (!extracted) return fromHistory;

  const gate = blockBookingIfIncomplete(history, latestMessage, extracted, lang);
  if (gate.blocked) {
    return { message: gate.message!, appointment: null };
  }

  const slot = preferHistorySlot(history, extracted, latestMessage);
  if (!slot) return fromHistory;

  const merged = mergeCollectedWithAction(gate.collected, { ...extracted, ...slot });

  const err = validateAppointmentAction(merged, customerPhone);
  if (err) return { message: err, appointment: null };

  try {
    return await persistAppointment(companyId, merged, lang);
  } catch (e) {
    return { message: `Randevu kaydedilemedi: ${(e as Error).message}`, appointment: null };
  }
}

/** Marker tabanlı işleme + yapılandırılmış yedek */
function wrapBookingReply(
  result: { message: string; appointment: Appointment | null },
  rawResponse: string,
  lang: ConversationLang
): { message: string; appointment: Appointment | null } {
  if (result.appointment) {
    return {
      message: buildAppointmentConfirmationMessage(result.appointment, lang),
      appointment: result.appointment,
    };
  }
  return {
    message: finalizeCustomerFacingMessage(result.message, {
      hadAppointmentMarker: rawResponse.includes(APPOINTMENT_MARKER),
      lang,
    }),
    appointment: null,
  };
}

export async function handleAppointmentBooking(
  companyId: string,
  customerPhone: string,
  customerName: string | null,
  rawResponse: string,
  history: HistoryMsg[],
  latestMessage: string,
  lang?: ConversationLang
): Promise<{ message: string; appointment: Appointment | null }> {
  const conversationLang = lang ?? detectConversationLanguage(latestMessage, history);
  const confirmed =
    isAppointmentConfirmation(latestMessage) || isAlternativeSlotSelection(history, latestMessage);

  if (confirmed) {
    const booking = await bookFromConfirmation(companyId, customerPhone, history, latestMessage);
    if (booking) return wrapBookingReply(booking, rawResponse, conversationLang);
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

  const gate = blockBookingIfIncomplete(history, latestMessage, action, conversationLang);

  const isBookingAttempt =
    confirmed ||
    rawResponse.includes(APPOINTMENT_MARKER) ||
    /randevu(nuz)?\s+.*(kayded|oluştur|olustur)/i.test(rawResponse);

  if (gate.blocked && isBookingAttempt) {
    return wrapBookingReply({ message: gate.message!, appointment: null }, rawResponse, conversationLang);
  }

  const fromMarker = await processAIAppointmentBooking(
    companyId,
    customerPhone,
    null,
    rawResponse,
    gate.collected,
    history,
    conversationLang,
    latestMessage,
    confirmed
  );
  if (fromMarker.appointment) return wrapBookingReply(fromMarker, rawResponse, conversationLang);

  if (rawResponse.includes(APPOINTMENT_MARKER) || confirmed) {
    const structured = await tryStructuredAppointmentBooking(
      companyId,
      customerPhone,
      history,
      latestMessage
    );
    if (structured) return wrapBookingReply(structured, rawResponse, conversationLang);
  }

  // Marker var ama onay yoksa teyit mesajı öncelikli
  if (fromMarker.message && rawResponse.includes(APPOINTMENT_MARKER) && !confirmed) {
    return wrapBookingReply(fromMarker, rawResponse, conversationLang);
  }

  return wrapBookingReply(fromMarker, rawResponse, conversationLang);
}
