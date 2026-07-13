/**
 * AI yanıtındaki <appointment_data> bloğunu parse eder ve müşteri mesajından ayırır
 */

export interface AppointmentDataPayload {
  customer_name?: string | null;
  customer_phone?: string | null;
  title?: string | null;
  preferred_doctor?: string | null;
  date?: string | null;
  time?: string | null;
  confirmed?: boolean;
}

const APPOINTMENT_DATA_RE = /<appointment_data>([\s\S]*?)<\/appointment_data>/i;

export interface ParsedAppointmentDataResult {
  data: AppointmentDataPayload | null;
  cleanMessage: string;
  hadBlock: boolean;
  parseError: boolean;
}

function tryParseJson(raw: string): AppointmentDataPayload | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    const result: AppointmentDataPayload = {};
    if ('customer_name' in parsed) {
      result.customer_name = normalizeNullableString(parsed.customer_name);
    }
    if ('customer_phone' in parsed) {
      result.customer_phone = normalizeNullableString(parsed.customer_phone);
    }
    if ('title' in parsed) {
      result.title = normalizeNullableString(parsed.title);
    }
    if ('preferred_doctor' in parsed) {
      result.preferred_doctor = normalizeNullableString(parsed.preferred_doctor);
    }
    if ('date' in parsed) {
      result.date = normalizeNullableString(parsed.date);
    }
    if ('time' in parsed) {
      result.time = normalizeNullableString(parsed.time);
    }
    if ('confirmed' in parsed) {
      result.confirmed = parsed.confirmed === true;
    }
    return result;
  } catch {
    return null;
  }
}

function normalizeNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return String(value);
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') return null;
  return trimmed;
}

/** AI yanıtından appointment_data bloğunu çıkarır */
export function parseAppointmentDataFromResponse(text: string): ParsedAppointmentDataResult {
  const match = text.match(APPOINTMENT_DATA_RE);
  if (!match) {
    return { data: null, cleanMessage: text.trim(), hadBlock: false, parseError: false };
  }

  const rawJson = match[1];
  const data = tryParseJson(rawJson);
  const cleanMessage = text.replace(APPOINTMENT_DATA_RE, '').trim();

  return {
    data,
    cleanMessage,
    hadBlock: true,
    parseError: data === null,
  };
}

/** Geçmiş AI mesajlarından kronolojik state merge için tüm blokları çıkarır */
export function extractAppointmentDataBlocksFromHistory(
  messages: { sender_type: string; message: string }[]
): AppointmentDataPayload[] {
  const blocks: AppointmentDataPayload[] = [];
  for (const m of messages) {
    if (m.sender_type !== 'ai' && m.sender_type !== 'assistant') continue;
    const parsed = parseAppointmentDataFromResponse(m.message);
    if (parsed.data) blocks.push(parsed.data);
  }
  return blocks;
}

export function formatSystemNotePrefix(note: string): string {
  return `[SISTEM NOTU: ${note.trim()}]`;
}
