/**
 * Randevu modunda AI yanıtını parser ile hizalar — yanlış tarih/red önlenir
 */

import { HistoryMsg, CollectedAppointmentFields, parseCollectedFields } from './appointment-collect.service';
import {
  parseSlotFromTurkishText,
  extractSlotFromConversation,
  buildAppointmentConfirmationPrompt,
  validateSlotWorkingHours,
  formatSlotLocalized,
  ParsedSlot,
} from './appointment-slot.service';
import { ConversationLang } from './language.service';

const REJECTION_RE =
  /alamazsınız|alamazsiniz|verilemiyor|verilemez|müsait değil|musait degil|uygun değil|uygun degil|dolu|kapalıdır|kapalidir/i;

const CONFIRMATION_RE = /onaylıyor musunuz|onayliyor musunuz|onaylıyor musun|do you confirm/i;

function hasDateTimeIntent(message: string): boolean {
  return /yarın|yarin|bugün|bugun|saat\s*\d|perşembe|pazartesi|salı|çarşamba|cuma|cumartesi|pazar|\d{1,2}[:.]\d{2}|\d{1,2}\s+(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)/i.test(
    message
  );
}

function resolveRequestedSlot(
  history: HistoryMsg[],
  latestMessage: string
): ParsedSlot | null {
  return (
    parseSlotFromTurkishText(latestMessage) ||
    extractSlotFromConversation(history, latestMessage)
  );
}

/**
 * AI randevu yanıtını düzelt: doğru tarihli onay metni veya geçerli saat reddini engelle
 */
export function reconcileAppointmentAiResponse(
  rawAiResponse: string,
  history: HistoryMsg[],
  latestMessage: string,
  lang: ConversationLang = 'tr'
): string {
  const collected = parseCollectedFields(history, latestMessage);
  if (!collected.customer_name || !collected.customer_phone || !collected.title) {
    return rawAiResponse;
  }

  const slot = resolveRequestedSlot(history, latestMessage);
  if (!slot) return rawAiResponse;

  const hours = validateSlotWorkingHours(slot);
  const slotLabel = formatSlotLocalized(slot.starts_at, slot.ends_at, lang);

  if (!hours.valid) {
    return `${hours.reason} Lütfen çalışma saatleri içinde başka bir saat yazın (Pzt–Cum 09:00–18:00, Cmt 09:00–14:00, öğle 12:30–13:30 kapalı).`;
  }

  const aiRejected = REJECTION_RE.test(rawAiResponse);
  const aiConfirming = CONFIRMATION_RE.test(rawAiResponse);
  const customerGaveTime = hasDateTimeIntent(latestMessage);

  if (customerGaveTime && (aiRejected || aiConfirming || /randevu özeti|tarih.*saat/i.test(rawAiResponse))) {
    return buildAppointmentConfirmationPrompt(collected, slot, lang);
  }

  if (aiConfirming) {
    return buildAppointmentConfirmationPrompt(collected, slot, lang);
  }

  if (aiRejected && customerGaveTime) {
    return buildAppointmentConfirmationPrompt(collected, slot, lang);
  }

  return rawAiResponse;
}

/** Prompt'a eklenecek parse edilmiş slot ipucu */
export function buildParsedSlotHint(
  history: HistoryMsg[],
  latestMessage: string,
  collected: CollectedAppointmentFields
): string {
  if (!collected.customer_name || !collected.customer_phone || !collected.title) {
    return '';
  }

  const slot = resolveRequestedSlot(history, latestMessage);
  if (!slot) return '';

  const label = formatSlotLocalized(slot.starts_at, slot.ends_at, 'tr');
  const hours = validateSlotWorkingHours(slot);
  if (!hours.valid) {
    return `\nMÜŞTERİ SAAT İSTEĞİ (sistem): ${label} — UYGUN DEĞİL (${hours.reason}). Alternatif saat öner.`;
  }

  return `\nMÜŞTERİ SAAT İSTEĞİ (sistem parse — onayda AYNEN bunu kullan): ${label}. Başka tarih yazma.`;
}
