/**
 * Canlı temsilciye aktarım — [TRANSFER] marker işleme ve ticket konusu
 */

import { TRANSFER_MARKER } from './system-prompt';

export interface ParsedTransferResponse {
  message: string;
  shouldTransfer: boolean;
}

/** AI yanıtından transfer marker'ını ayırır; müşteriye gösterilmez */
export function stripTransferMarker(text: string): ParsedTransferResponse {
  const trimmed = text.trim();
  if (!trimmed.includes(TRANSFER_MARKER)) {
    return { message: trimmed, shouldTransfer: false };
  }

  const escaped = TRANSFER_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const message = trimmed
    .replace(new RegExp(`\\s*${escaped}\\s*$`), '')
    .replaceAll(TRANSFER_MARKER, '')
    .trim();

  return { message, shouldTransfer: true };
}

const SUBJECT_LABELS: Record<string, string> = {
  human_transfer_request: 'Live agent request',
  transfer_confirmed: 'Transfer confirmed',
  customer_frustration: 'Frustrated customer',
  prompt_injection: 'Security — prompt injection',
  sensitive_data: 'Security — sensitive data',
  opt_out: 'Opt-out request',
  ai_transfer: 'AI handoff to agent',
  ai_disabled: 'AI off — customer message',
};

export const AI_DISABLED_TICKET_SUBJECT = SUBJECT_LABELS.ai_disabled;

export function buildTransferTicketSubject(
  customerMessage: string,
  skipReason?: string
): string {
  if (skipReason && SUBJECT_LABELS[skipReason]) {
    return SUBJECT_LABELS[skipReason];
  }

  const preview = customerMessage.trim().slice(0, 80);
  return preview.length > 0 ? `Customer: ${preview}` : 'Live support request';
}
