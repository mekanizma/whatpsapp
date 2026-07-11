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
  parseDateFromText,
  extractSlotFromConversation,
  buildAppointmentConfirmationPrompt,
  validateSlotWorkingHours,
  formatSlotLocalized,
  formatWeekdayLocalized,
  buildWorkingHoursRejectionMessage,
  hasDateOnlyIntent,
  slotMatchesRequestedDate,
  ParsedSlot,
  localToUtcInTimezone,
} from './appointment-slot.service';
import { ConversationLang, t, localeForLang } from './language.service';
import { hasDateTimeIntent, hasAvailabilityQuery, normalizeAppointmentDateText, weekdayInText } from './appointment-datetime-tokens';
import {
  type AppointmentCompanyContext,
  DEFAULT_APPOINTMENT_CONTEXT,
} from './appointment-company-context';
import { weekdayToDayKey } from '../services/working-hours.service';

const REJECTION_RE =
  /alamazsınız|alamazsiniz|verilemiyor|verilemez|müsait değil|musait degil|uygun değil|uygun degil|dolu|kapalıdır|kapalidir|not available|cannot book/i;

const CONFIRMATION_RE =
  /onaylıyor musunuz|onayliyor musunuz|onaylıyor musun|do you confirm|randevu özeti|appointment summary/i;

const DATE_QUESTION_RE =
  /tarih.*ne|hangi\s+tarih|gün\s+ne|hangi\s+gün|what.*date|tell.*date|tarihi\s+söyle|tarihi\s+soyle|tarihi\s+yaz/i;

const VAGUE_DATE_RE =
  /\b(\d{1,3}\s*)?(gün\s*sonra|gun\s*sonra|days?\s*later|yarın|yarin|tomorrow|ertesi\s*gün|ertesi\s*gun|öbür\s*gün|obur\s*gun|oburgun|gelecek\s*hafta|haftaya|next\s*week|\d{1,2}\s*hafta\s*sonra|\d{1,2}\s*ay\s*sonra)\b/i;

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

function isAvailabilityQuestion(latestMessage: string, ctx: AppointmentCompanyContext): boolean {
  const options = slotParseOptions(ctx);
  return hasAvailabilityQuery(latestMessage) || hasDateOnlyIntent(latestMessage, options);
}

function formatDateLabel(
  dateParts: { year: number; month: number; day: number },
  lang: ConversationLang,
  timeZone: string
): string {
  const ref = localToUtcInTimezone(dateParts.year, dateParts.month, dateParts.day, 12, 0, timeZone);
  const locale = localeForLang(lang);
  const day = ref.toLocaleDateString(locale, {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const weekday = formatWeekdayLocalized(ref.toISOString(), lang, timeZone);
  const weekdayPart = weekday ? ` (${weekday.charAt(0).toUpperCase()}${weekday.slice(1)})` : '';
  return `${day}${weekdayPart}`;
}

function formatAvailabilitySlots(
  slots: { starts_at: string; ends_at: string }[],
  lang: ConversationLang,
  timeZone: string
): string {
  return slots
    .map((slot, i) => {
      const label = formatSlotLocalized(slot.starts_at, slot.ends_at, lang, timeZone);
      return `${i + 1}) ${label}`;
    })
    .join('\n');
}

function isNextWeekRangeQuery(message: string): boolean {
  const normalized = normalizeAppointmentDateText(message);
  return /gelecek\s*hafta|haftaya/.test(normalized) && weekdayInText(message) === null;
}

async function buildAvailabilityResponse(
  companyId: string,
  latestMessage: string,
  lang: ConversationLang,
  ctx: AppointmentCompanyContext
): Promise<string | null> {
  const options = slotParseOptions(ctx);
  const { findAvailableSlotsOnDate, findAvailableSlots } = await import(
    '../services/appointment.service'
  );

  if (isNextWeekRangeQuery(latestMessage)) {
    const ref = options.ref ?? new Date();
    const weekAfter = new Date(ref.getTime() + 7 * 24 * 60 * 60 * 1000);
    const slots = await findAvailableSlots(companyId, ctx, {
      count: 12,
      daysAhead: 7,
      after: weekAfter,
    });
    if (slots.length === 0) {
      const fallback = await findAvailableSlots(companyId, ctx, { count: 5, daysAhead: 30 });
      if (fallback.length === 0) {
        return t(lang, 'appointment_availability_none', { date: 'gelecek hafta' });
      }
      return t(lang, 'appointment_availability_none_with_alts', {
        date: 'gelecek hafta',
        alternatives: formatAvailabilitySlots(fallback, lang, ctx.timezone),
      });
    }
    return t(lang, 'appointment_availability_week_list', {
      slots: formatAvailabilitySlots(slots, lang, ctx.timezone),
    });
  }

  const dateParts = parseDateFromText(latestMessage, options);
  if (!dateParts) return null;

  const dateLabel = formatDateLabel(dateParts, lang, ctx.timezone);
  const wd = localToUtcInTimezone(
    dateParts.year,
    dateParts.month,
    dateParts.day,
    12,
    0,
    ctx.timezone
  ).getUTCDay();
  const daySchedule = ctx.schedule[weekdayToDayKey(wd)];

  if (!daySchedule) {
    const alternatives = await findAvailableSlots(companyId, ctx, { count: 5, daysAhead: 30 });
    if (alternatives.length > 0) {
      return t(lang, 'appointment_availability_none_with_alts', {
        date: dateLabel,
        alternatives: formatAvailabilitySlots(alternatives, lang, ctx.timezone),
      });
    }
    return t(lang, 'appointment_availability_day_closed', { date: dateLabel });
  }

  const slots = await findAvailableSlotsOnDate(companyId, dateParts, ctx);
  if (slots.length === 0) {
    const dayEnd = localToUtcInTimezone(
      dateParts.year,
      dateParts.month,
      dateParts.day,
      23,
      59,
      ctx.timezone
    );
    const alternatives = await findAvailableSlots(companyId, ctx, {
      count: 5,
      daysAhead: 30,
      after: dayEnd,
    });
    if (alternatives.length > 0) {
      return t(lang, 'appointment_availability_none_with_alts', {
        date: dateLabel,
        alternatives: formatAvailabilitySlots(alternatives, lang, ctx.timezone),
      });
    }
    return t(lang, 'appointment_availability_none', { date: dateLabel });
  }

  return t(lang, 'appointment_availability_list', {
    date: dateLabel,
    slots: formatAvailabilitySlots(slots, lang, ctx.timezone),
  });
}

function shouldUseDeterministicSummary(
  rawAiResponse: string,
  latestMessage: string,
  slot: ParsedSlot | null,
  ctx: AppointmentCompanyContext
): boolean {
  if (!slot) return false;
  if (isAvailabilityQuestion(latestMessage, ctx)) return false;
  if (!slotMatchesRequestedDate(slot, latestMessage, slotParseOptions(ctx))) return false;
  if (CONFIRMATION_RE.test(rawAiResponse)) return true;
  if (VAGUE_DATE_RE.test(rawAiResponse)) return true;
  if (isComplaintOrCorrectionMessage(latestMessage)) return true;
  if (DATE_QUESTION_RE.test(latestMessage)) return true;
  if (/randevu özeti|appointment summary|tarih\/saat|date\/time/i.test(rawAiResponse)) return true;
  return false;
}

async function buildConfirmationIfSlotFree(
  companyId: string | undefined,
  collected: CollectedAppointmentFields,
  slot: ParsedSlot,
  lang: ConversationLang,
  ctx: AppointmentCompanyContext
): Promise<string | null> {
  const hours = validateSlotWorkingHours(slot, ctx, lang);
  if (!hours.valid) return null;

  if (companyId) {
    const { hasConflict, buildConflictMessageWithAlternatives } = await import(
      '../services/appointment.service'
    );
    const conflict = await hasConflict(companyId, slot.starts_at, slot.ends_at);
    if (conflict) {
      return buildConflictMessageWithAlternatives(companyId, slot.starts_at, slot.ends_at, lang);
    }
  }

  return buildAppointmentConfirmationPrompt(collected, slot, lang, ctx.timezone);
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
  if (companyId && isAvailabilityQuestion(latestMessage, ctx)) {
    const availabilityResponse = await buildAvailabilityResponse(
      companyId,
      latestMessage,
      lang,
      ctx
    );
    if (availabilityResponse) return availabilityResponse;
  }

  const collected = parseCollectedFields(history, latestMessage);
  if (getMissingRequiredFields(collected).length > 0) {
    if (
      isAvailabilityQuestion(latestMessage, ctx) &&
      (CONFIRMATION_RE.test(rawAiResponse) || /randevu özeti|appointment summary/i.test(rawAiResponse))
    ) {
      return t(lang, 'appointment_time_unclear');
    }
    return rawAiResponse;
  }

  const slotFromConversation = resolveRequestedSlot(history, latestMessage, ctx);

  if (shouldUseDeterministicSummary(rawAiResponse, latestMessage, slotFromConversation, ctx)) {
    const confirmation = await buildConfirmationIfSlotFree(
      companyId,
      collected,
      slotFromConversation!,
      lang,
      ctx
    );
    if (confirmation) return confirmation;
  }

  const customerGaveTime = hasDateTimeIntent(latestMessage);
  const options = slotParseOptions(ctx);
  const slot =
    customerGaveTime && !hasDateOnlyIntent(latestMessage, options)
      ? slotFromConversation
      : null;

  if (!slot && slotFromConversation && VAGUE_DATE_RE.test(rawAiResponse)) {
    if (slotMatchesRequestedDate(slotFromConversation, latestMessage, options)) {
      const confirmation = await buildConfirmationIfSlotFree(
        companyId,
        collected,
        slotFromConversation,
        lang,
        ctx
      );
      if (confirmation) return confirmation;
    }
  }
  if (!slot) {
    if (
      isAvailabilityQuestion(latestMessage, ctx) &&
      (CONFIRMATION_RE.test(rawAiResponse) || /randevu özeti|appointment summary/i.test(rawAiResponse))
    ) {
      return t(lang, 'appointment_time_unclear');
    }
    return rawAiResponse;
  }

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
    const confirmation = await buildConfirmationIfSlotFree(companyId, collected, slot, lang, ctx);
    if (confirmation) return confirmation;
  }

  if (
    customerGaveTime &&
    slotMatchesRequestedDate(slot, latestMessage, options) &&
    (aiRejected || aiConfirming || /randevu özeti|tarih.*saat|appointment summary/i.test(rawAiResponse))
  ) {
    const confirmation = await buildConfirmationIfSlotFree(companyId, collected, slot, lang, ctx);
    if (confirmation) return confirmation;
  }

  if (
    (aiConfirming || (VAGUE_DATE_RE.test(rawAiResponse) && slotFromConversation)) &&
    slotFromConversation &&
    slotMatchesRequestedDate(slotFromConversation, latestMessage, options)
  ) {
    const confirmation = await buildConfirmationIfSlotFree(
      companyId,
      collected,
      slot,
      lang,
      ctx
    );
    if (confirmation) return confirmation;
  }

  if (aiRejected && customerGaveTime && slotMatchesRequestedDate(slot, latestMessage, options)) {
    const confirmation = await buildConfirmationIfSlotFree(companyId, collected, slot, lang, ctx);
    if (confirmation) return confirmation;
  }

  return rawAiResponse;
}

function weekdayInCustomerMessage(message: string): boolean {
  return weekdayInText(message) !== null;
}

/** Prompt'a eklenecek parse edilmiş slot ipucu */
export function buildParsedSlotHint(
  history: HistoryMsg[],
  latestMessage: string,
  collected: CollectedAppointmentFields,
  ctx: AppointmentCompanyContext = DEFAULT_APPOINTMENT_CONTEXT,
  lang: ConversationLang = 'tr'
): string {
  if (!collected.customer_name || !collected.customer_phone || !collected.title) {
    return '';
  }

  const options = slotParseOptions(ctx);
  if (!hasDateTimeIntent(latestMessage) || hasDateOnlyIntent(latestMessage, options)) return '';

  const slot = resolveRequestedSlot(history, latestMessage, ctx);
  if (!slot) return '';

  const label = formatSlotLocalized(slot.starts_at, slot.ends_at, lang, ctx.timezone);
  const hours = validateSlotWorkingHours(slot, ctx, lang);
  if (!hours.valid) {
    return `\nPARSED CUSTOMER TIME (system): ${label} — NOT VALID (${hours.reason}). Suggest alternatives from AVAILABLE SLOTS only.`;
  }

  return `\nPARSED CUSTOMER TIME (system — use EXACTLY in confirmation): ${label}. Do not write a different date.`;
}
