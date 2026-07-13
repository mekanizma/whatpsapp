/**
 * LLM randevu akışı — müsaitlik YALNIZCA veritabanından okunur ve AI'ya sistem notu olarak iletilir.
 */

import { hasConflict, logAppointmentEvent } from '../services/appointment.service';
import { hasAvailabilityQuery, hasDateTimeIntent } from './appointment-datetime-tokens';
import type { HistoryMsg } from './appointment-collect.service';
import type { AppointmentCompanyContext } from './appointment-company-context';
import { ConversationLang, t } from './language.service';
import {
  extractCustomerSlotFromConversation,
  extractNumberedAlternative,
  formatSlotLocalized,
  hasRecentNumberedSlotList,
  isNumberedSlotReply,
  parseDateAnchorFromText,
  validateSlotWorkingHours,
  buildWorkingHoursRejectionMessage,
  companyDateParts,
  companyTimeParts,
  localToUtcInTimezone,
  type ParsedSlot,
} from './appointment-slot.service';
import { listAvailableSlotsForDate } from './appointment-workflow.service';

export const appointmentAvailabilityDeps = {
  hasConflict,
  listAvailableSlotsForDate,
};

export function shouldQueryAppointmentAvailability(
  message: string,
  history: HistoryMsg[] = []
): boolean {
  if (hasAvailabilityQuery(message) || hasDateTimeIntent(message)) return true;
  if (isNumberedSlotReply(message) && hasRecentNumberedSlotList(history)) return true;
  return false;
}

function slotOptions(ctx: AppointmentCompanyContext) {
  return { timezone: ctx.timezone, ref: ctx.parseRef };
}

function slotToStateFields(
  slot: ParsedSlot,
  timezone: string
): { date: string; time: string } {
  const d = companyDateParts(new Date(slot.starts_at), timezone);
  const tm = companyTimeParts(new Date(slot.starts_at), timezone);
  const date = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
  const time = `${String(tm.hour).padStart(2, '0')}:${String(tm.minute).padStart(2, '0')}`;
  return { date, time };
}

function resolveDateAnchor(
  history: HistoryMsg[],
  latestMessage: string,
  ctx: AppointmentCompanyContext
): string | null {
  const options = slotOptions(ctx);
  const messages = [...history, { sender_type: 'customer', message: latestMessage }];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.sender_type !== 'customer') continue;
    const anchor = parseDateAnchorFromText(m.message, options);
    if (anchor) return anchor;
  }
  return null;
}

async function safeHasConflict(
  companyId: string,
  startsAt: string,
  endsAt: string
): Promise<{ occupied: boolean; error: boolean }> {
  try {
    logAppointmentEvent('llm_check', { companyId, startsAt, endsAt });
    const occupied = await appointmentAvailabilityDeps.hasConflict(
      companyId,
      startsAt,
      endsAt
    );
    logAppointmentEvent('llm_check_result', { companyId, startsAt, endsAt, occupied });
    return { occupied, error: false };
  } catch (err) {
    logAppointmentEvent('llm_check_error', {
      companyId,
      startsAt,
      endsAt,
      error: (err as Error).message,
    });
    return { occupied: false, error: true };
  }
}

function formatDateLabel(dateIso: string, ctx: AppointmentCompanyContext, lang: ConversationLang): string {
  const parts = companyDateParts(new Date(dateIso), ctx.timezone);
  return formatSlotLocalized(
    localToUtcInTimezone(parts.year, parts.month, parts.day, 9, 0, ctx.timezone).toISOString(),
    localToUtcInTimezone(parts.year, parts.month, parts.day, 9, 30, ctx.timezone).toISOString(),
    lang,
    ctx.timezone
  ).split(' ')[0];
}

function formatSlotsList(
  slots: { starts_at: string; ends_at: string }[],
  lang: ConversationLang,
  timeZone: string
): string {
  if (slots.length === 0) {
    return t(lang, 'appointment_no_available_slots');
  }
  return slots
    .map((s, i) => `${i + 1}) ${formatSlotLocalized(s.starts_at, s.ends_at, lang, timeZone)}`)
    .join('\n');
}

export interface AppointmentAvailabilityContext {
  systemNote: string | null;
  statePatch: { date: string; time: string } | null;
  dbError: boolean;
}

export interface AppointmentAvailabilityStateHint {
  date?: string | null;
  time?: string | null;
}

async function buildSpecificSlotNote(
  companyId: string,
  slot: ParsedSlot,
  ctx: AppointmentCompanyContext,
  lang: ConversationLang
): Promise<AppointmentAvailabilityContext> {
  const slotLabel = formatSlotLocalized(slot.starts_at, slot.ends_at, lang, ctx.timezone);
  const statePatch = slotToStateFields(slot, ctx.timezone);
  const hoursCheck = validateSlotWorkingHours(slot, ctx, lang);

  if (!hoursCheck.valid) {
    const reason = buildWorkingHoursRejectionMessage(hoursCheck, ctx, lang);
    return {
      systemNote:
        `VERİTABANI MÜSAİTLİK SONUCU (belirli saat): ${slotLabel} — ÇALIŞMA SAATLERİ DIŞINDA.\n` +
        `Sebep: ${reason}\n` +
        'Müşteriye kendi cümlelerinle nazikçe açıkla; bu saatin müsait olduğunu SÖYLEME.',
      statePatch,
      dbError: false,
    };
  }

  const { occupied, error } = await safeHasConflict(companyId, slot.starts_at, slot.ends_at);
  if (error) {
    return {
      systemNote:
        'VERİTABANI HATASI: Randevu takvimine erişilemedi.\n' +
        `Müşteriye şunu ilet (kendi cümlelerinle): ${t(lang, 'appointment_db_unavailable')}`,
      statePatch,
      dbError: true,
    };
  }

  if (occupied) {
    let altBlock = '';
    try {
      const alternatives = await appointmentAvailabilityDeps.listAvailableSlotsForDate(
        companyId,
        slot.starts_at,
        ctx,
        8
      );
      if (alternatives.length > 0) {
        altBlock =
          `\nAynı gün veritabanından okunan müsait saatler:\n${formatSlotsList(alternatives, lang, ctx.timezone)}`;
      }
    } catch {
      // alternatif listesi opsiyonel
    }

    return {
      systemNote:
        `VERİTABANI MÜSAİTLİK SONUCU (belirli saat): ${slotLabel} — DOLU.\n` +
        'Müşteriye bu saatin dolu olduğunu söyle ve alternatif tarih/saat iste.' +
        ' Kendi uydurma saat ÖNERME; yalnızca aşağıdaki listedeki saatleri müsait olarak söyle.' +
        altBlock,
      statePatch,
      dbError: false,
    };
  }

  return {
    systemNote:
      `VERİTABANI MÜSAİTLİK SONUCU (belirli saat): ${slotLabel} — MÜSAİT.\n` +
      'Müşteriye bu saatin müsait olduğunu söyle ve randevu özetini onay iste. ' +
      'Müşteri onayladığında sistem randevuyu doğrudan onaylı kaydeder; "iletişime geçilecek" deme.',
    statePatch,
    dbError: false,
  };
}

async function buildDayAvailabilityNote(
  companyId: string,
  dateIso: string,
  ctx: AppointmentCompanyContext,
  lang: ConversationLang
): Promise<AppointmentAvailabilityContext> {
  const dateLabel = formatDateLabel(dateIso, ctx, lang);

  try {
    const available = await appointmentAvailabilityDeps.listAvailableSlotsForDate(
      companyId,
      dateIso,
      ctx
    );
    const list = formatSlotsList(available, lang, ctx.timezone);

    if (available.length === 0) {
      return {
        systemNote:
          `VERİTABANI MÜSAİTLİK SONUCU (${dateLabel}): Bu gün için müsait saat YOK.\n` +
          'Müşteriye başka bir gün önermesini iste; saat UYDURMA.',
        statePatch: null,
        dbError: false,
      };
    }

    return {
      systemNote:
        `VERİTABANI MÜSAİTLİK SONUCU (${dateLabel}):\n${list}\n\n` +
        'Bu liste veritabanından okundu. YALNIZCA bu saatleri müsait olarak söyle; liste dışı saat UYDURMA.',
      statePatch: null,
      dbError: false,
    };
  } catch {
    return {
      systemNote:
        'VERİTABANI HATASI: Randevu takvimine erişilemedi.\n' +
        `Müşteriye şunu ilet (kendi cümlelerinle): ${t(lang, 'appointment_db_unavailable')}`,
      statePatch: null,
      dbError: true,
    };
  }
}

export async function buildAppointmentAvailabilityContext(
  companyId: string,
  history: HistoryMsg[],
  latestMessage: string,
  ctx: AppointmentCompanyContext,
  lang: ConversationLang,
  stateHint: AppointmentAvailabilityStateHint = {}
): Promise<AppointmentAvailabilityContext> {
  const options = {
    ...slotOptions(ctx),
    ...(stateHint.date ? { dateAnchor: stateHint.date } : {}),
  };

  if (isNumberedSlotReply(latestMessage)) {
    const numberedSlot = extractNumberedAlternative(history, latestMessage, options);
    if (numberedSlot) {
      return buildSpecificSlotNote(companyId, numberedSlot, ctx, lang);
    }
  }

  if (!shouldQueryAppointmentAvailability(latestMessage, history)) {
    return { systemNote: null, statePatch: null, dbError: false };
  }

  const slot = extractCustomerSlotFromConversation(history, latestMessage, options);

  if (slot) {
    return buildSpecificSlotNote(companyId, slot, ctx, lang);
  }

  if (hasAvailabilityQuery(latestMessage)) {
    const dateIso = resolveDateAnchor(history, latestMessage, ctx);
    if (!dateIso) {
      return {
        systemNote:
          'Müşteri müsaitlik sordu ancak tarih belirtilmedi. Önce net bir tarih iste; ' +
          'müsaitlik bilgisi veritabanından ancak tarih bilindikten sonra kontrol edilir.',
        statePatch: null,
        dbError: false,
      };
    }
    return buildDayAvailabilityNote(companyId, dateIso, ctx, lang);
  }

  return { systemNote: null, statePatch: null, dbError: false };
}

export function mergeAppointmentSystemNotes(...notes: Array<string | null | undefined>): string | null {
  const merged = notes.map((n) => n?.trim()).filter(Boolean) as string[];
  return merged.length > 0 ? merged.join('\n\n') : null;
}
