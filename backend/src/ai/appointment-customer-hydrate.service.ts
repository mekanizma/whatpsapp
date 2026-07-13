/**
 * Müşteri mesajlarından randevu state hydrate — AI yazımını değil müşterinin metnini esas alır
 */

import {
  parseCollectedFields,
  isValidFullName,
  isValidProcedureTitle,
  looksLikeSubject,
  type HistoryMsg,
  type CollectedAppointmentFields,
} from './appointment-collect.service';
import {
  type AppointmentLlmState,
  mergeAppointmentData,
  createEmptyAppointmentState,
} from './appointment-state.service';
import type { AppointmentDataPayload } from './appointment-data-parser.service';

const NAME_CORRECTION_RE =
  /ismim|adım|adin|adim|yanlış|yanlis|yanli[sş]|doğru\s*ad|dogru\s*ad|isim\s*bu|adım\s*bu/i;

const TOPIC_ASK_RE =
  /hangi konu|hangi hizmet|hangi işlem|hangi islem|randevu konusu|ne için randevu|ne icin randevu|konu\/hizmet|what.*(service|for|about)|which service/i;

function extractTopicFromLatestTurn(history: HistoryMsg[], latestMessage: string): string | null {
  const trimmed = latestMessage.trim();
  if (!trimmed || !isValidProcedureTitle(trimmed)) return null;
  if (isValidFullName(trimmed) && !looksLikeSubject(trimmed)) return null;
  if (NAME_CORRECTION_RE.test(trimmed)) return null;

  const lastAi = [...history].reverse().find((m) => m.sender_type === 'ai' || m.sender_type === 'assistant');
  if (lastAi && TOPIC_ASK_RE.test(lastAi.message)) {
    return trimmed;
  }
  return null;
}

/** Müşteri ad düzeltmesi algıla — "ismim gurcem semercioglu" vb. */
export function detectNameCorrection(latestMessage: string): string | null {
  const trimmed = latestMessage.trim();
  if (!trimmed || !NAME_CORRECTION_RE.test(trimmed)) return null;

  const ismimMatch = trimmed.match(
    /(?:ismim|adım|adin|adim)\s+(?:bu\s+)?(.+?)(?:\s*[.!?]|$)/iu
  );
  if (ismimMatch?.[1]) {
    const candidate = ismimMatch[1].trim();
    if (isValidFullName(candidate)) return candidate;
  }

  if (isValidFullName(trimmed)) return trimmed;
  return null;
}

export function extractCustomerFields(
  history: HistoryMsg[],
  latestMessage: string
): CollectedAppointmentFields {
  return parseCollectedFields(history, latestMessage);
}

/** Konuşmadan müşteri kaynaklı alanları state'e yansıt */
export function hydrateStateFromCustomerMessages(
  state: AppointmentLlmState,
  history: HistoryMsg[],
  latestMessage: string
): AppointmentLlmState {
  const collected = extractCustomerFields(history, latestMessage);
  const correction = detectNameCorrection(latestMessage);
  const next = { ...state };

  const name = correction || collected.customer_name;
  if (name && isValidFullName(name)) {
    next.customer_name = name;
  }
  if (collected.customer_phone) {
    next.customer_phone = collected.customer_phone;
  }
  if (collected.title && isValidProcedureTitle(collected.title)) {
    next.title = collected.title;
  }
  const topicReply = extractTopicFromLatestTurn(history, latestMessage);
  if (topicReply) {
    next.title = topicReply;
  }
  if (collected.doctor_name) {
    next.preferred_doctor = collected.doctor_name;
  }

  return next;
}

/** AI data bloğunu merge et; müşteri mesajındaki alanlar öncelikli */
export function mergeAiDataPreferCustomer(
  state: AppointmentLlmState,
  aiData: AppointmentDataPayload,
  customer: CollectedAppointmentFields,
  history: HistoryMsg[],
  latestMessage: string
): AppointmentLlmState {
  let next = mergeAppointmentData(state, aiData);
  const correction = detectNameCorrection(latestMessage);

  const name = correction || customer.customer_name;
  if (name && isValidFullName(name)) {
    next.customer_name = name;
  }
  if (customer.customer_phone) {
    next.customer_phone = customer.customer_phone;
  }
  const topicReply = extractTopicFromLatestTurn(history, latestMessage);
  if (topicReply) {
    next.title = topicReply;
  } else if (customer.title && isValidProcedureTitle(customer.title)) {
    next.title = customer.title;
  }

  return next;
}

export function shouldExpectAppointmentDataBlock(state: AppointmentLlmState): boolean {
  return !!(
    state.customer_name &&
    state.customer_phone &&
    state.title &&
    isValidFullName(state.customer_name) &&
    isValidProcedureTitle(state.title)
  );
}

export function hasNameCorrectionInMessage(message: string): boolean {
  return NAME_CORRECTION_RE.test(message.trim());
}

/** Oturum + geçmiş + müşteri mesajından tam state çöz */
export function resolveAppointmentState(
  persisted: AppointmentLlmState | null,
  history: HistoryMsg[],
  latestMessage: string
): AppointmentLlmState {
  const base = persisted ? { ...persisted } : createEmptyAppointmentState();
  return hydrateStateFromCustomerMessages(base, history, latestMessage);
}
