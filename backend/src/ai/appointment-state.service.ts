/**
 * LLM randevu akışı state yönetimi — oturum meta verisi
 */

import type { AppointmentSystemNoteKey } from '../config/appointment.config';
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
}

export interface AppointmentSessionMeta {
  status: AppointmentFlowStatus;
  turnCount: number;
  validationFailures: Partial<Record<AppointmentSystemNoteKey, number>>;
  slotTakenCount: number;
  pendingSystemNote: string | null;
  pendingSystemNoteKey: AppointmentSystemNoteKey | null;
  lastHandoffReason: string | null;
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
  };
}

export function resolveAppointmentState(sessionState: AppointmentLlmState | null): AppointmentLlmState {
  if (!sessionState) return createEmptyAppointmentState();
  return { ...sessionState };
}

export function buildLlmCollectedContext(state: AppointmentLlmState): string {
  return JSON.stringify({
    name: state.customer_name,
    phone: state.customer_phone,
    topic: state.title,
    date: state.date,
    time: state.time,
  });
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

export function isAppointmentSessionRestartMessage(message: string): boolean {
  const trimmed = message.trim().toLocaleLowerCase('tr');
  return /randevu\s*al|randevu\s*istem|yeni\s*randevu|appointment\s*book|make\s*appointment/i.test(
    trimmed
  );
}

export function resetAppointmentSessionForRetry(
  companyId: string,
  customerPhone: string
): AppointmentSessionMeta {
  clearAppointmentSession(companyId, customerPhone);
  return getAppointmentSession(companyId, customerPhone);
}

export function countAppointmentAiTurns(history: HistoryMsg[]): number {
  return history.filter((m) => m.sender_type === 'ai' || m.sender_type === 'assistant').length;
}

export function applySlotTakenReset(state: AppointmentLlmState): AppointmentLlmState {
  return {
    ...state,
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

export function _resetAppointmentSessionsForTest(): void {
  sessionStore.clear();
}
