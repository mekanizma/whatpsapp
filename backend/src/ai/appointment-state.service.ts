/**
 * LLM randevu akışı state yönetimi — geçmiş + oturum meta verisi
 */

import type { AppointmentSystemNoteKey } from '../config/appointment.config';
import {
  type AppointmentDataPayload,
  extractAppointmentDataBlocksFromHistory,
} from './appointment-data-parser.service';
import type { HistoryMsg } from './appointment-collect.service';

export type AppointmentFlowStatus = 'collecting' | 'saved' | 'handed_off';

export interface AppointmentLlmState {
  status: AppointmentFlowStatus;
  customer_name: string | null;
  customer_phone: string | null;
  title: string | null;
  preferred_doctor: string | null;
  date: string | null;
  time: string | null;
  confirmed: boolean;
}

export interface AppointmentSessionMeta {
  status: AppointmentFlowStatus;
  turnCount: number;
  validationFailures: Partial<Record<AppointmentSystemNoteKey, number>>;
  slotTakenCount: number;
  missingDataBlockStreak: number;
  pendingSystemNote: string | null;
  pendingSystemNoteKey: AppointmentSystemNoteKey | null;
  lastHandoffReason: string | null;
  /** Oturum boyunca biriken randevu alanları — DB mesajlarında appointment_data saklanmaz */
  llmState: AppointmentLlmState | null;
  expires: number;
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const sessionStore = new Map<string, AppointmentSessionMeta>();

function sessionKey(companyId: string, customerPhone: string): string {
  return `${companyId}:${customerPhone.replace(/\D/g, '')}`;
}

export function createEmptyAppointmentState(): AppointmentLlmState {
  return {
    status: 'collecting',
    customer_name: null,
    customer_phone: null,
    title: null,
    preferred_doctor: null,
    date: null,
    time: null,
    confirmed: false,
  };
}

export function mergeAppointmentData(
  state: AppointmentLlmState,
  data: AppointmentDataPayload
): AppointmentLlmState {
  const next = { ...state };
  if (data.customer_name !== undefined) next.customer_name = data.customer_name ?? null;
  if (data.customer_phone !== undefined) next.customer_phone = data.customer_phone ?? null;
  if (data.title !== undefined) next.title = data.title ?? null;
  if (data.preferred_doctor !== undefined) next.preferred_doctor = data.preferred_doctor ?? null;
  if (data.date !== undefined) next.date = data.date ?? null;
  if (data.time !== undefined) next.time = data.time ?? null;
  if (data.confirmed !== undefined) next.confirmed = data.confirmed === true;
  return next;
}

/** Geçmiş AI yanıtlarındaki appointment_data bloklarından state üretir */
export function rebuildStateFromHistory(history: HistoryMsg[]): AppointmentLlmState {
  let state = createEmptyAppointmentState();
  const blocks = extractAppointmentDataBlocksFromHistory(history);
  for (const block of blocks) {
    state = mergeAppointmentData(state, block);
  }
  return state;
}

export function buildLlmCollectedContext(state: AppointmentLlmState): string {
  const onay = state.confirmed ? 'evet' : 'hayır';
  const parts = [
    'Şu ana kadar toplanan:',
    `Ad Soyad: ${state.customer_name ?? 'null'}`,
    `Telefon: ${state.customer_phone ?? 'null'}`,
    `Konu: ${state.title ?? 'null'}`,
    `Tarih: ${state.date ?? 'null'}`,
    `Saat: ${state.time ?? 'null'}`,
    `Onay: ${onay}`,
  ];
  if (state.customer_name) {
    parts.push(`NOT: Adı müşterinin yazdığı gibi AYNEN kullan — otomatik düzeltme yapma.`);
  }
  return parts.join(' | ');
}

export function getAppointmentSession(
  companyId: string,
  customerPhone: string
): AppointmentSessionMeta {
  const key = sessionKey(companyId, customerPhone);
  const now = Date.now();
  const existing = sessionStore.get(key);
  if (existing && existing.expires > now) return existing;

  const fresh: AppointmentSessionMeta = {
    status: 'collecting',
    turnCount: 0,
    validationFailures: {},
    slotTakenCount: 0,
    missingDataBlockStreak: 0,
    pendingSystemNote: null,
    pendingSystemNoteKey: null,
    lastHandoffReason: null,
    llmState: null,
    expires: now + SESSION_TTL_MS,
  };
  sessionStore.set(key, fresh);
  return fresh;
}

export function saveAppointmentSession(
  companyId: string,
  customerPhone: string,
  meta: AppointmentSessionMeta,
  llmState?: AppointmentLlmState
): void {
  sessionStore.set(sessionKey(companyId, customerPhone), {
    ...meta,
    llmState: llmState ?? meta.llmState,
    expires: Date.now() + SESSION_TTL_MS,
  });
}

export function clearAppointmentSession(companyId: string, customerPhone: string): void {
  sessionStore.delete(sessionKey(companyId, customerPhone));
}

export function countAppointmentAiTurns(history: HistoryMsg[]): number {
  return history.filter((m) => m.sender_type === 'ai' || m.sender_type === 'assistant').length;
}

export function applySlotTakenReset(state: AppointmentLlmState): AppointmentLlmState {
  return {
    ...state,
    confirmed: false,
    date: null,
    time: null,
  };
}

export function markSessionHandedOff(
  meta: AppointmentSessionMeta,
  reason: string
): AppointmentSessionMeta {
  return {
    ...meta,
    status: 'handed_off',
    lastHandoffReason: reason,
    pendingSystemNoteKey: 'HANDOFF',
    pendingSystemNote: null,
  };
}

export function incrementValidationFailure(
  meta: AppointmentSessionMeta,
  key: AppointmentSystemNoteKey
): AppointmentSessionMeta {
  const count = (meta.validationFailures[key] || 0) + 1;
  return {
    ...meta,
    validationFailures: { ...meta.validationFailures, [key]: count },
  };
}

/** Test hook */
export function _resetAppointmentSessionsForTest(): void {
  sessionStore.clear();
}
