/**
 * Müşteri onay ifadelerini tanır (deterministik randevu akışı).
 */

import type { HistoryMsg } from './appointment-collect.service';
import {
  PENDING_CONFIRM_PATTERN,
  STRONG_CONFIRM_PATTERN,
  WEAK_CONFIRM_PATTERN,
} from './appointment-confirm-tokens';

export function hasPendingAppointmentConfirmation(history: HistoryMsg[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.sender_type !== 'ai' && m.sender_type !== 'assistant') continue;
    if (PENDING_CONFIRM_PATTERN.test(m.message)) return true;
  }
  return false;
}

export function isAppointmentConfirmation(message: string, history: HistoryMsg[] = []): boolean {
  const trimmed = message.trim();
  if (STRONG_CONFIRM_PATTERN.test(trimmed)) return true;
  if (WEAK_CONFIRM_PATTERN.test(trimmed) && hasPendingAppointmentConfirmation(history)) return true;
  return false;
}
