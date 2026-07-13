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
import { isAppointmentConfirmation } from './appointment-confirm.service';
import type { AppointmentCompanyContext } from './appointment-company-context';
import {
  extractCustomerSlotFromConversation,
  extractDateTimeFromRecentAiSummary,
  extractHourChoiceFromSlotList,
  extractNumberedAlternative,
  parseDateAnchorFromText,
  slotToAppointmentStateFields,
} from './appointment-slot.service';

const NAME_CORRECTION_RE =
  /ismim|adım|adin|adim|yanlış|yanlis|yanli[sş]|doğru\s*ad|dogru\s*ad|isim\s*bu|adım\s*bu/i;

const TOPIC_ASK_RE =
  /hangi konu|hangi hizmet|hangi işlem|hangi islem|randevu konusu|randevu konusunu|konuyu öğren|konuyu ogren|ne için randevu|ne icin randevu|konu\/hizmet|what.*(service|for|about)|which service/i;

const TOPIC_CORRECTION_RE =
  /demedim|yanlış|yanlis|yanli[sş]|doğru\s*konu|dogru\s*konu|demek istedim|konu bu değil|konu bu degil/i;

function scoreTopicCandidate(text: string): number {
  if (!text || !isValidProcedureTitle(text)) return -100;
  let score = text.length;
  if (looksLikeSubject(text)) score += 80;
  return score;
}

/** Müşteri konu düzeltmesi — "ediyoruz demedimki ... dedim" vb. */
export function detectTopicCorrection(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed || !TOPIC_CORRECTION_RE.test(trimmed)) return null;

  const quoted = trimmed.match(/["'«](.+?)["'»]/);
  if (quoted?.[1]) {
    const candidate = quoted[1].trim();
    if (isValidProcedureTitle(candidate)) return candidate;
  }

  const dedimMatch = trimmed.match(/(.+?)\s+dedim\b/iu);
  if (dedimMatch?.[1]) {
    const candidate = dedimMatch[1]
      .replace(/^.*(?:demedim(?:ki)?[,.]?\s*)/iu, '')
      .trim();
    if (isValidProcedureTitle(candidate)) return candidate;
  }

  return null;
}

export function hasTopicCorrectionInMessage(message: string): boolean {
  return TOPIC_CORRECTION_RE.test(message.trim());
}

function resolveBestTopicFromHistory(history: HistoryMsg[], latestMessage: string): string | null {
  let best: string | null = null;
  let bestScore = -Infinity;

  const consider = (candidate: string | null | undefined, bonus = 0) => {
    const text = candidate?.trim();
    if (!text || !isValidProcedureTitle(text)) return;
    const score = scoreTopicCandidate(text) + bonus;
    if (score > bestScore) {
      bestScore = score;
      best = text;
    }
  };

  const correction = detectTopicCorrection(latestMessage);
  if (correction) consider(correction, 120);

  for (const m of history) {
    if (m.sender_type !== 'customer') continue;
    consider(detectTopicCorrection(m.message), 100);
  }

  for (let i = 0; i < history.length - 1; i++) {
    const curr = history[i];
    const next = history[i + 1];
    if (curr.sender_type !== 'ai' && curr.sender_type !== 'assistant') continue;
    if (next.sender_type !== 'customer') continue;
    if (!TOPIC_ASK_RE.test(curr.message)) continue;
    consider(extractTopicFromLatestTurn(history.slice(0, i + 1), next.message));
  }

  return best;
}

export function extractTopicFromLatestTurn(
  history: HistoryMsg[],
  latestMessage: string
): string | null {
  const trimmed = latestMessage.trim();
  if (!trimmed || isAppointmentConfirmation(trimmed, history)) return null;
  if (!isValidProcedureTitle(trimmed)) return null;
  if (isValidFullName(trimmed) && !looksLikeSubject(trimmed)) return null;
  if (NAME_CORRECTION_RE.test(trimmed)) return null;

  const lastAi = [...history].reverse().find((m) => m.sender_type === 'ai' || m.sender_type === 'assistant');
  if (lastAi && TOPIC_ASK_RE.test(lastAi.message)) {
    return trimmed;
  }
  return null;
}

export function isAppointmentTopicReply(
  history: HistoryMsg[],
  latestMessage: string
): boolean {
  return extractTopicFromLatestTurn(history, latestMessage) !== null;
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
  const topicCorrection = detectTopicCorrection(latestMessage);
  const next = { ...state };

  const name = correction || collected.customer_name;
  if (name && isValidFullName(name)) {
    next.customer_name = name;
  }
  if (collected.customer_phone) {
    next.customer_phone = collected.customer_phone;
  }
  if (topicCorrection) {
    next.title = topicCorrection;
  } else if (collected.title && isValidProcedureTitle(collected.title)) {
    next.title = collected.title;
  }
  const topicReply = extractTopicFromLatestTurn(history, latestMessage);
  if (topicReply) {
    next.title = topicReply;
  }
  const bestTopic = resolveBestTopicFromHistory(history, latestMessage);
  if (bestTopic && (!next.title || scoreTopicCandidate(bestTopic) > scoreTopicCandidate(next.title))) {
    next.title = bestTopic;
  }
  if (isAppointmentConfirmation(latestMessage, history)) {
    next.confirmed = true;
  }
  if (collected.doctor_name) {
    next.preferred_doctor = collected.doctor_name;
  }

  return next;
}

function resolveDateAnchorFromHistory(
  history: HistoryMsg[],
  latestMessage: string,
  ctx: AppointmentCompanyContext,
  stateDate: string | null
): string | undefined {
  if (stateDate) return stateDate;
  const options = { timezone: ctx.timezone, ref: ctx.parseRef };
  const messages = [...history, { sender_type: 'customer', message: latestMessage }];
  for (let i = messages.length - 1; i >= 0; i--) {
    const anchor = parseDateAnchorFromText(messages[i].message, options);
    if (anchor) {
      const d = new Date(anchor);
      const parts = {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
      };
      return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    }
  }
  return undefined;
}

/** Müşteri mesajları ve AI özetlerinden tarih/saat state hydrate */
export function hydrateDateTimeFromConversation(
  state: AppointmentLlmState,
  history: HistoryMsg[],
  latestMessage: string,
  ctx: AppointmentCompanyContext
): AppointmentLlmState {
  let next = { ...state };
  const dateAnchor = resolveDateAnchorFromHistory(history, latestMessage, ctx, next.date);
  const options = {
    timezone: ctx.timezone,
    ref: ctx.parseRef,
    dateAnchor,
  };

  const applySlot = (slot: { starts_at: string; ends_at: string } | null) => {
    if (!slot) return;
    const patch = slotToAppointmentStateFields(slot, ctx.timezone);
    next = mergeAppointmentData(next, patch);
  };

  if (!next.date || !next.time) {
    applySlot(extractNumberedAlternative(history, latestMessage, options));
  }
  if (!next.date || !next.time) {
    applySlot(extractHourChoiceFromSlotList(history, latestMessage, options));
  }
  if (!next.date || !next.time) {
    applySlot(extractCustomerSlotFromConversation(history, latestMessage, options));
  }
  if (!next.date || !next.time) {
    const fromAi = extractDateTimeFromRecentAiSummary(history, options);
    if (fromAi) next = mergeAppointmentData(next, fromAi);
  }

  return next;
}
export function mergeAiDataPreferCustomer(
  state: AppointmentLlmState,
  aiData: AppointmentDataPayload,
  customer: CollectedAppointmentFields,
  history: HistoryMsg[],
  latestMessage: string
): AppointmentLlmState {
  let next = mergeAppointmentData(state, aiData);
  const correction = detectNameCorrection(latestMessage);
  const topicCorrection = detectTopicCorrection(latestMessage);

  const name = correction || customer.customer_name;
  if (name && isValidFullName(name)) {
    next.customer_name = name;
  }
  if (customer.customer_phone) {
    next.customer_phone = customer.customer_phone;
  }
  if (topicCorrection) {
    next.title = topicCorrection;
  }
  const topicReply = extractTopicFromLatestTurn(history, latestMessage);
  if (topicReply) {
    next.title = topicReply;
  } else if (customer.title && isValidProcedureTitle(customer.title)) {
    next.title = customer.title;
  }
  const bestTopic = resolveBestTopicFromHistory(history, latestMessage);
  if (bestTopic && (!next.title || scoreTopicCandidate(bestTopic) > scoreTopicCandidate(next.title))) {
    next.title = bestTopic;
  }
  if (isAppointmentConfirmation(latestMessage, history)) {
    next.confirmed = true;
  }

  return next;
}

export function shouldExpectAppointmentDataBlock(state: AppointmentLlmState): boolean {
  if (!state.customer_name || !state.customer_phone || !state.title) return false;
  if (!isValidFullName(state.customer_name) || !isValidProcedureTitle(state.title)) return false;
  // Ad/telefon/konu aşamasında kod müşteri mesajından hydrate eder — AI bloğu zorunlu değil.
  if (!state.date || !state.time) return false;
  // Onay öncesi güncel appointment_data beklenir; tarih/saat kod tarafından da parse edilir.
  return !state.confirmed;
}

export function hasNameCorrectionInMessage(message: string): boolean {
  return NAME_CORRECTION_RE.test(message.trim());
}

/** Oturum + geçmiş + müşteri mesajından tam state çöz */
export function resolveAppointmentState(
  persisted: AppointmentLlmState | null,
  history: HistoryMsg[],
  latestMessage: string,
  ctx?: AppointmentCompanyContext
): AppointmentLlmState {
  const base = persisted ? { ...persisted } : createEmptyAppointmentState();
  let state = hydrateStateFromCustomerMessages(base, history, latestMessage);
  if (ctx) {
    state = hydrateDateTimeFromConversation(state, history, latestMessage, ctx);
  }
  return state;
}
