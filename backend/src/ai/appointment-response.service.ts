/**
 * Randevu modunda AI yanıtını parser ile hizalar — yanlış tarih/red önlenir
 */

import {
  HistoryMsg,
  CollectedAppointmentFields,
  parseCollectedFields,
  getMissingRequiredFields,
  isComplaintOrCorrectionMessage,
} from './appointment-collect.service';
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
import { hasConflict } from '../services/appointment.service';

const REJECTION_RE =
  /alamazsınız|alamazsiniz|verilemiyor|verilemez|müsait değil|musait degil|uygun değil|uygun degil|dolu|kapalıdır|kapalidir|not available|cannot book/i;

const CONFIRMATION_RE =
  /onaylıyor musunuz|onayliyor musunuz|onaylıyor musun|do you confirm|randevu özeti|appointment summary/i;

const DATE_QUESTION_RE =
  /tarih.*ne|hangi\s+tarih|gün\s+ne|hangi\s+gün|what.*date|tell.*date|tarihi\s+söyle|tarihi\s+soyle|tarihi\s+yaz/i;

const VAGUE_DATE_RE =
  /\b(\d{1,3}\s*)?(gün\s*sonra|gun\s*sonra|days?\s*later|yarın|yarin|tomorrow|ertesi\s*gün|ertesi\s*gun|öbür\s*gün|obur\s*gun|gelecek\s*hafta|next\s*week)\b/i;

const WRONG_DAY_RE =
  /pazar.*kapalı|pazar.*kapali|sunday.*closed|pazar günü|pazar gunu/i;

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

function shouldUseDeterministicSummary(
  rawAiResponse: string,
  latestMessage: string,
  slot: ParsedSlot | null
): boolean {
  if (!slot) return false;
  if (CONFIRMATION_RE.test(rawAiResponse)) return true;
  if (VAGUE_DATE_RE.test(rawAiResponse)) return true;
  if (isComplaintOrCorrectionMessage(latestMessage)) return true;
  if (DATE_QUESTION_RE.test(latestMessage)) return true;
  if (/randevu özeti|appointment summary|tarih\/saat|date\/time/i.test(rawAiResponse)) return true;
  return false;
}

/**
 * AI randevu yanıtını düzelt: doğru tarihli onay metni veya geçerli saat reddini engelle
 */
export async function reconcileAppointmentAiResponse(
  rawAiResponse: string,
  history: HistoryMsg[],
  latestMessage: string,
  lang: ConversationLang = 'tr',
  ctx: AppointmentCompanyContext = DEFAULT_APPOINTMENT_CONTEXT,
  companyId?: string
): Promise<string> {
  const collected = parseCollectedFields(history, latestMessage);
  if (getMissingRequiredFields(collected).length > 0) {
    return rawAiResponse;
  }

  const slotFromConversation = resolveRequestedSlot(history, latestMessage, ctx);

  if (shouldUseDeterministicSummary(rawAiResponse, latestMessage, slotFromConversation)) {
    const hours = validateSlotWorkingHours(slotFromConversation!, ctx, lang);
    if (hours.valid) {
      if (companyId) {
        const conflict = await hasConflict(
          companyId,
          slotFromConversation!.starts_at,
          slotFromConversation!.ends_at
        );
        if (!conflict) {
          return buildAppointmentConfirmationPrompt(
            collected,
            slotFromConversation!,
            lang,
            ctx.timezone
          );
        }
      } else {
        return buildAppointmentConfirmationPrompt(
          collected,
          slotFromConversation!,
          lang,
          ctx.timezone
        );
      }
    }
  }

  const customerGaveTime = hasDateTimeIntent(latestMessage);
  const slot = customerGaveTime ? slotFromConversation : null;
  if (!slot && slotFromConversation && VAGUE_DATE_RE.test(rawAiResponse)) {
    return buildAppointmentConfirmationPrompt(collected, slotFromConversation, lang, ctx.timezone);
  }
  if (!slot) return rawAiResponse;

  const hours = validateSlotWorkingHours(slot, ctx, lang);

  if (!hours.valid) {
    if (WRONG_DAY_RE.test(rawAiResponse) && weekdayInCustomerMessage(latestMessage)) {
      return buildWorkingHoursRejectionMessage(hours, ctx, lang);
    }
    return buildWorkingHoursRejectionMessage(hours, ctx, lang);
  }

  const aiRejected = REJECTION_RE.test(rawAiResponse);
  const aiConfirming = CONFIRMATION_RE.test(rawAiResponse);

  if (companyId && aiRejected && customerGaveTime) {
    const conflict = await hasConflict(companyId, slot.starts_at, slot.ends_at);
    if (!conflict) {
      return buildAppointmentConfirmationPrompt(collected, slot, lang, ctx.timezone);
    }
  }

  if (
    customerGaveTime &&
    (aiRejected || aiConfirming || /randevu özeti|tarih.*saat|appointment summary/i.test(rawAiResponse))
  ) {
    return buildAppointmentConfirmationPrompt(collected, slot, lang, ctx.timezone);
  }

  if (aiConfirming || (VAGUE_DATE_RE.test(rawAiResponse) && slotFromConversation)) {
    return buildAppointmentConfirmationPrompt(collected, slot, lang, ctx.timezone);
  }

  if (aiRejected && customerGaveTime) {
    return buildAppointmentConfirmationPrompt(collected, slot, lang, ctx.timezone);
  }

  return rawAiResponse;
}

function weekdayInCustomerMessage(message: string): boolean {
  return /\b(pazartesi|salı|sali|çarşamba|carsamba|perşembe|persembe|cuma|cumartesi|pazar|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
    message
  );
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
