/**
 * LLM randevu akışı — müsaitlik YALNIZCA veritabanından okunur (state tarih/saat ile)
 */

import { hasConflict, logAppointmentEvent } from '../services/appointment.service';
import type { AppointmentCompanyContext } from './appointment-company-context';
import { ConversationLang, t } from './language.service';
import {
  formatSlotLocalized,
  validateSlotWorkingHours,
  buildWorkingHoursRejectionMessage,
  companyDateParts,
  localToUtcInTimezone,
  type ParsedSlot,
} from './appointment-slot.service';
import { listAvailableSlotsForDate } from './appointment-workflow.service';
import { buildSlotFromState } from './appointment-llm-validation.service';
import type { AppointmentLlmState } from './appointment-state.service';

export const appointmentAvailabilityDeps = {
  hasConflict,
  listAvailableSlotsForDate,
};

export interface AppointmentAvailabilityContext {
  systemNote: string | null;
  dbError: boolean;
}

export interface AppointmentAvailabilityState {
  date: string | null;
  time: string | null;
}

async function safeHasConflict(
  companyId: string,
  startsAt: string,
  endsAt: string
): Promise<{ occupied: boolean; error: boolean }> {
  try {
    logAppointmentEvent('llm_check', { companyId, startsAt, endsAt });
    const occupied = await appointmentAvailabilityDeps.hasConflict(companyId, startsAt, endsAt);
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

async function buildSpecificSlotNote(
  companyId: string,
  slot: ParsedSlot,
  ctx: AppointmentCompanyContext,
  lang: ConversationLang
): Promise<AppointmentAvailabilityContext> {
  const slotLabel = formatSlotLocalized(slot.starts_at, slot.ends_at, lang, ctx.timezone);
  const hoursCheck = validateSlotWorkingHours(slot, ctx, lang);

  if (!hoursCheck.valid) {
    const reason = buildWorkingHoursRejectionMessage(hoursCheck, ctx, lang);
    return {
      systemNote:
        `VERİTABANI MÜSAİTLİK SONUCU (belirli saat): ${slotLabel} — ÇALIŞMA SAATLERİ DIŞINDA.\n` +
        `Sebep: ${reason}\n` +
        'Müşteriye kendi cümlelerinle nazikçe açıkla; bu saatin müsait olduğunu SÖYLEME.',
      dbError: false,
    };
  }

  const { occupied, error } = await safeHasConflict(companyId, slot.starts_at, slot.ends_at);
  if (error) {
    return {
      systemNote:
        'VERİTABANI HATASI: Randevu takvimine erişilemedi.\n' +
        `Müşteriye şunu ilet (kendi cümlelerinle): ${t(lang, 'appointment_db_unavailable')}`,
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
      dbError: false,
    };
  }

  return {
    systemNote:
      `VERİTABANI MÜSAİTLİK SONUCU (belirli saat): ${slotLabel} — MÜSAİT.\n` +
      'Müşteriye bu saatin müsait olduğunu söyle; tüm bilgiler tamamlandığında action save ile kayıt yapılır.',
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
        dbError: false,
      };
    }

    return {
      systemNote:
        `VERİTABANI MÜSAİTLİK SONUCU (${dateLabel}):\n${list}\n\n` +
        'Bu liste veritabanından okundu. YALNIZCA bu saatleri müsait olarak söyle; liste dışı saat UYDURMA.',
      dbError: false,
    };
  } catch {
    return {
      systemNote:
        'VERİTABANI HATASI: Randevu takvimine erişilemedi.\n' +
        `Müşteriye şunu ilet (kendi cümlelerinle): ${t(lang, 'appointment_db_unavailable')}`,
      dbError: true,
    };
  }
}

export async function buildAppointmentAvailabilityContext(
  companyId: string,
  ctx: AppointmentCompanyContext,
  lang: ConversationLang,
  state: AppointmentAvailabilityState
): Promise<AppointmentAvailabilityContext> {
  if (!state.date) {
    return { systemNote: null, dbError: false };
  }

  if (state.date && state.time) {
    const slotState: AppointmentLlmState = {
      status: 'collecting',
      customer_name: null,
      customer_phone: null,
      title: null,
      preferred_doctor: null,
      date: state.date,
      time: state.time,
    };
    const slot = buildSlotFromState(slotState, ctx);
    if (slot) {
      return buildSpecificSlotNote(companyId, slot, ctx, lang);
    }
    return {
      systemNote:
        'State içindeki tarih/saat geçersiz formatta; müşteriden YYYY-MM-DD ve HH:MM formatında tekrar iste.',
      dbError: false,
    };
  }

  return buildDayAvailabilityNote(companyId, state.date, ctx, lang);
}

export function mergeAppointmentSystemNotes(...notes: Array<string | null | undefined>): string | null {
  const merged = notes.map((n) => n?.trim()).filter(Boolean) as string[];
  return merged.length > 0 ? merged.join('\n\n') : null;
}
