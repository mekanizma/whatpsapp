/**
 * Konuşma geçmişi — token tasarrufu için yerel özet + son mesajlar
 */

import { config } from '../config';
import { parseCollectedFields, HistoryMsg } from './appointment-collect.service';
import { extractSlotFromConversation, formatSlotLocalized } from './appointment-slot.service';

const RECENT_VERBATIM_DEFAULT = 12;
const HISTORY_MESSAGE_MAX_CHARS = 300;

const SKIP_INTENT_RE =
  /^(evet|tamam|onay|ok|hayır|hayir|teşekkür|tesekkur|merhaba|selam|thanks|hello|hi|yes|no)$/iu;

/** Eski mesajlardan randevu alanları + son müşteri niyeti — LLM çağrısı yok */
export function buildOlderMessagesSummary(
  olderMessages: HistoryMsg[],
  latestCustomerMessage: string
): string {
  const collected = parseCollectedFields(olderMessages, latestCustomerMessage);
  const parts: string[] = ['[Önceki konuşma özeti — sistem]'];

  if (collected.customer_name) parts.push(`Ad: ${collected.customer_name}`);
  if (collected.customer_phone) parts.push(`Tel: ${collected.customer_phone}`);
  if (collected.title) parts.push(`Konu: ${collected.title}`);
  if (collected.doctor_name) parts.push(`Personel: ${collected.doctor_name}`);

  const slot = extractSlotFromConversation(olderMessages, latestCustomerMessage);
  if (slot) {
    parts.push(`Tarih/saat: ${formatSlotLocalized(slot.starts_at, slot.ends_at, 'tr')}`);
  }

  const intent = extractLastCustomerIntent(olderMessages);
  if (intent) parts.push(`Son niyet: ${intent}`);

  if (parts.length === 1) {
    return '[Önceki konuşma kısaltıldı — ayrıntılar son mesajlarda.]';
  }

  return parts.join(' | ');
}

function extractLastCustomerIntent(messages: HistoryMsg[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.sender_type !== 'customer') continue;
    const text = m.message.trim();
    if (text.length < 4 || SKIP_INTENT_RE.test(text)) continue;
    return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  }
  return null;
}

function trimHistoryMessage(message: string, maxChars: number): string {
  return message.slice(0, maxChars);
}

/**
 * OpenAI chat geçmişi — limit aşılırsa son N mesaj + tek satır özet.
 * Randevu iş mantığı için tam geçmiş ayrı tutulmalıdır.
 */
export function prepareConversationHistoryForChat(
  messages: HistoryMsg[],
  latestCustomerMessage: string,
  options?: {
    maxMessages?: number;
    recentKeep?: number;
    messageMaxChars?: number;
  }
): HistoryMsg[] {
  const maxMessages = options?.maxMessages ?? config.ai.maxHistoryMessages;
  const recentKeep = options?.recentKeep ?? RECENT_VERBATIM_DEFAULT;
  const maxChars = options?.messageMaxChars ?? HISTORY_MESSAGE_MAX_CHARS;

  const filtered = messages.filter((m) => m.message !== latestCustomerMessage);
  const trim = (m: HistoryMsg): HistoryMsg => ({
    ...m,
    message: trimHistoryMessage(m.message, maxChars),
  });

  if (filtered.length <= maxMessages) {
    return filtered.map(trim);
  }

  const older = filtered.slice(0, -recentKeep);
  const recent = filtered.slice(-recentKeep);
  const summary = buildOlderMessagesSummary(older, latestCustomerMessage);

  return [{ sender_type: 'assistant', message: trimHistoryMessage(summary, maxChars) }, ...recent.map(trim)];
}
