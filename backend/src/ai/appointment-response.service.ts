/**
 * Randevu modunda AI yanıtını parser ile hizalar — yanlış tarih/red önlenir
 */

import { HistoryMsg, CollectedAppointmentFields, parseCollectedFields, getMissingRequiredFields } from './appointment-collect.service';
import {
  parseSlotFromText,
  extractSlotFromConversation,
  buildAppointmentConfirmationPrompt,
  validateSlotWorkingHours,
  formatSlotLocalized,
  buildWorkingHoursRejectionMessage,
  ParsedSlot,
} from './appointment-slot.service';
import { ConversationLang } from './language.service';
import { hasDateTimeIntent } from './appointment-datetime-tokens';
import {
  type AppointmentCompanyContext,
  DEFAULT_APPOINTMENT_CONTEXT,
} from './appointment-company-context';

const REJECTION_RE =
  /alamazsınız|alamazsiniz|verilemiyor|verilemez|müsait değil|musait degil|uygun değil|uygun degil|dolu|kapalıdır|kapalidir|not available|cannot book/i;

const CONFIRMATION_RE = /onaylıyor musunuz|onayliyor musunuz|onaylıyor musun|do you confirm/i;

function slotParseOptions(ctx: AppointmentCompanyContext, ref?: Date) {
  return { timezone: ctx.timezone, ref: ref ?? ctx.parseRef };
}

function resolveRequestedSlot(
  history: HistoryMsg[],
  latestMessage: string,
  ctx: AppointmentCompanyContext
): ParsedSlot | null {
  const options = slotParseOptions(ctx);
  return (
    extractSlotFromConversation(history, latestMessage, options) ||
    parseSlotFromText(latestMessage, options)
  );
}

/**
 * AI randevu yanıtını düzelt: doğru tarihli onay metni veya geçerli saat reddini engelle
 */
export function reconcileAppointmentAiResponse(
  rawAiResponse: string,
  history: HistoryMsg[],
  latestMessage: string,
  lang: ConversationLang = 'tr',
  ctx: AppointmentCompanyContext = DEFAULT_APPOINTMENT_CONTEXT
): string {
  const collected = parseCollectedFields(history, latestMessage);
  if (getMissingRequiredFields(collected).length > 0) {
    return rawAiResponse;
  }

  const customerGaveTime = hasDateTimeIntent(latestMessage);
  const slot = customerGaveTime ? resolveRequestedSlot(history, latestMessage, ctx) : null;
  if (!slot) return rawAiResponse;

  const hours = validateSlotWorkingHours(slot, ctx, lang);
  const slotLabel = formatSlotLocalized(slot.starts_at, slot.ends_at, lang, ctx.timezone);

  if (!hours.valid) {
    return buildWorkingHoursRejectionMessage(hours, ctx, lang);
  }

  const aiRejected = REJECTION_RE.test(rawAiResponse);
  const aiConfirming = CONFIRMATION_RE.test(rawAiResponse);

  if (customerGaveTime && (aiRejected || aiConfirming || /randevu özeti|tarih.*saat|appointment summary/i.test(rawAiResponse))) {
    return buildAppointmentConfirmationPrompt(collected, slot, lang, ctx.timezone);
  }

  if (aiConfirming) {
    return buildAppointmentConfirmationPrompt(collected, slot, lang, ctx.timezone);
  }

  if (aiRejected && customerGaveTime) {
    return buildAppointmentConfirmationPrompt(collected, slot, lang, ctx.timezone);
  }

  return rawAiResponse;
}

/** Prompt'a eklenecek parse edilmiş slot ipucu */
export function buildParsedSlotHint(
  history: HistoryMsg[],
  latestMessage: string,
  collected: CollectedAppointmentFields,
  ctx: AppointmentCompanyContext = DEFAULT_APPOINTMENT_CONTEXT
): string {
  if (!collected.customer_name || !collected.customer_phone || !collected.title) {
    return '';
  }

  if (!hasDateTimeIntent(latestMessage)) return '';

  const slot = resolveRequestedSlot(history, latestMessage, ctx);
  if (!slot) return '';

  const label = formatSlotLocalized(slot.starts_at, slot.ends_at, 'tr', ctx.timezone);
  const hours = validateSlotWorkingHours(slot, ctx, 'tr');
  if (!hours.valid) {
    return `\nMÜŞTERİ SAAT İSTEĞİ (sistem): ${label} — UYGUN DEĞİL (${hours.reason}). Alternatif saat öner.`;
  }

  return `\nMÜŞTERİ SAAT İSTEĞİ (sistem parse — onayda AYNEN bunu kullan): ${label}. Başka tarih yazma.`;
}
