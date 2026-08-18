/**
 * Per-tenant custom AI instructions — validation and sanitization
 */

import { TRANSFER_MARKER } from '../ai/system-prompt';

const CONTROL_CHARS_EXCEPT_NEWLINE = /[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g;
const EXCESS_NEWLINES = /\n{3,}/g;

export function sanitizeCustomInstructions(text: string): string {
  let result = text.replaceAll('{{', '').replaceAll('}}', '');
  result = result.replaceAll(TRANSFER_MARKER, '');
  result = result.replace(CONTROL_CHARS_EXCEPT_NEWLINE, '');
  result = result.replace(EXCESS_NEWLINES, '\n\n');
  return result.trim();
}

export function validateCustomInstructionsForWrite(
  raw: unknown
):
  | { ok: true; value: string | null; provided: true }
  | { ok: true; provided: false }
  | { ok: false; error: string } {
  if (raw === undefined) {
    return { ok: true, provided: false };
  }

  if (raw === null || raw === '') {
    return { ok: true, value: null, provided: true };
  }

  if (typeof raw !== 'string') {
    return { ok: false, error: 'Özel talimatlar metin formatında olmalıdır.' };
  }

  const trimmed = raw.trim();
  const sanitized = sanitizeCustomInstructions(trimmed);
  return { ok: true, value: sanitized || null, provided: true };
}
