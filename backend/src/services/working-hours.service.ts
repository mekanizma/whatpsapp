/**
 * Tenant working hours — parse, validate, and schedule helpers
 */

import { z } from 'zod';
import { ConversationLang, t } from '../ai/language.service';

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface DayBreak {
  start: string;
  end: string;
}

export interface DaySchedule {
  open: string;
  close: string;
  breaks?: DayBreak[];
}

export type WorkingHoursSchedule = Record<DayKey, DaySchedule | null>;

const lunchBreak: DayBreak = { start: '12:30', end: '13:30' };

export const DEFAULT_WORKING_HOURS: WorkingHoursSchedule = {
  sun: null,
  mon: { open: '09:00', close: '18:00', breaks: [lunchBreak] },
  tue: { open: '09:00', close: '18:00', breaks: [lunchBreak] },
  wed: { open: '09:00', close: '18:00', breaks: [lunchBreak] },
  thu: { open: '09:00', close: '18:00', breaks: [lunchBreak] },
  fri: { open: '09:00', close: '18:00', breaks: [lunchBreak] },
  sat: { open: '09:00', close: '14:00' },
};

export function parseHm(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function formatHm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isBreakInsideDay(day: DaySchedule, br: DayBreak): boolean {
  const open = parseHm(day.open);
  const close = parseHm(day.close);
  const start = parseHm(br.start);
  const end = parseHm(br.end);
  return start > open && end < close && start < end;
}

const DayBreakSchema = z
  .object({
    start: z.string().regex(HM_RE, 'break start must be HH:MM'),
    end: z.string().regex(HM_RE, 'break end must be HH:MM'),
  })
  .refine((b) => parseHm(b.start) < parseHm(b.end), 'break start must be before end');

const DayScheduleSchema = z
  .object({
    open: z.string().regex(HM_RE, 'open must be HH:MM'),
    close: z.string().regex(HM_RE, 'close must be HH:MM'),
    breaks: z.array(DayBreakSchema).optional(),
  })
  .refine((d) => parseHm(d.open) < parseHm(d.close), 'open must be before close')
  .refine(
    (d) => (d.breaks || []).every((br) => isBreakInsideDay(d, br)),
    'breaks must be strictly inside open–close'
  );

const DayValueSchema = z.union([DayScheduleSchema, z.null()]);

const WorkingHoursWriteSchema = z
  .object({
    sun: DayValueSchema.optional(),
    mon: DayValueSchema.optional(),
    tue: DayValueSchema.optional(),
    wed: DayValueSchema.optional(),
    thu: DayValueSchema.optional(),
    fri: DayValueSchema.optional(),
    sat: DayValueSchema.optional(),
  })
  .strict();

function dayKeyFromWeekday(weekday: number): DayKey {
  return DAY_KEYS[weekday] || 'sun';
}

export function weekdayToDayKey(weekday: number): DayKey {
  return dayKeyFromWeekday(weekday);
}

/** Lenient runtime parse — unknown keys ignored; empty/invalid → full default */
export function parseWorkingHoursForRuntime(raw: unknown): WorkingHoursSchedule {
  const base: WorkingHoursSchedule = {
    sun: DEFAULT_WORKING_HOURS.sun,
    mon: DEFAULT_WORKING_HOURS.mon ? { ...DEFAULT_WORKING_HOURS.mon, breaks: [...(DEFAULT_WORKING_HOURS.mon.breaks || [])] } : null,
    tue: DEFAULT_WORKING_HOURS.tue ? { ...DEFAULT_WORKING_HOURS.tue, breaks: [...(DEFAULT_WORKING_HOURS.tue.breaks || [])] } : null,
    wed: DEFAULT_WORKING_HOURS.wed ? { ...DEFAULT_WORKING_HOURS.wed, breaks: [...(DEFAULT_WORKING_HOURS.wed.breaks || [])] } : null,
    thu: DEFAULT_WORKING_HOURS.thu ? { ...DEFAULT_WORKING_HOURS.thu, breaks: [...(DEFAULT_WORKING_HOURS.thu.breaks || [])] } : null,
    fri: DEFAULT_WORKING_HOURS.fri ? { ...DEFAULT_WORKING_HOURS.fri, breaks: [...(DEFAULT_WORKING_HOURS.fri.breaks || [])] } : null,
    sat: DEFAULT_WORKING_HOURS.sat ? { ...DEFAULT_WORKING_HOURS.sat, breaks: DEFAULT_WORKING_HOURS.sat.breaks ? [...DEFAULT_WORKING_HOURS.sat.breaks] : undefined } : null,
  };

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return base;
  }

  const obj = raw as Record<string, unknown>;
  let hasAnyValid = false;

  for (const key of DAY_KEYS) {
    if (!(key in obj)) continue;
    const parsed = DayValueSchema.safeParse(obj[key]);
    if (parsed.success) {
      base[key] = parsed.data;
      hasAnyValid = true;
    }
  }

  return hasAnyValid ? base : { ...DEFAULT_WORKING_HOURS };
}

export function validateWorkingHoursForWrite(
  raw: unknown
): { ok: true; data: WorkingHoursSchedule } | { ok: false; error: string } {
  const parsed = WorkingHoursWriteSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message || 'Invalid working_hours' };
  }

  const schedule = parseWorkingHoursForRuntime(parsed.data);
  return { ok: true, data: schedule };
}

const WEEKDAY_NAME_KEYS: Record<DayKey, string> = {
  sun: 'weekday_sun',
  mon: 'weekday_mon',
  tue: 'weekday_tue',
  wed: 'weekday_wed',
  thu: 'weekday_thu',
  fri: 'weekday_fri',
  sat: 'weekday_sat',
};

export function formatWeekdayName(lang: ConversationLang, weekday: number): string {
  const key = weekdayToDayKey(weekday);
  return t(lang, WEEKDAY_NAME_KEYS[key] as 'weekday_mon');
}

export function buildScheduleSummary(schedule: WorkingHoursSchedule, lang: ConversationLang): string {
  const openDays = DAY_KEYS.filter((k) => schedule[k] !== null);
  if (!openDays.length) {
    return t(lang, 'appointment_no_open_days');
  }

  const groups = new Map<string, DayKey[]>();
  for (const key of openDays) {
    const day = schedule[key]!;
    const breaks = (day.breaks || []).map((b) => `${b.start}-${b.end}`).join(',');
    const signature = `${day.open}-${day.close}|${breaks}`;
    const list = groups.get(signature) || [];
    list.push(key);
    groups.set(signature, list);
  }

  const parts: string[] = [];
  for (const [signature, keys] of groups) {
    const [hours, breaksStr] = signature.split('|');
    const [open, close] = hours.split('-');
    const dayLabel =
      keys.length === 1
        ? t(lang, WEEKDAY_NAME_KEYS[keys[0]] as 'weekday_mon')
        : `${t(lang, WEEKDAY_NAME_KEYS[keys[0]] as 'weekday_mon')}–${t(lang, WEEKDAY_NAME_KEYS[keys[keys.length - 1]] as 'weekday_mon')}`;
    let line = t(lang, 'appointment_schedule_line', { day: dayLabel, open, close });
    if (breaksStr) {
      const br = (schedule[keys[0]]!.breaks || [])[0];
      if (br) {
        line += ` ${t(lang, 'appointment_schedule_break', { breakStart: br.start, breakEnd: br.end })}`;
      }
    }
    parts.push(line);
  }

  const closed = DAY_KEYS.filter((k) => schedule[k] === null);
  if (closed.length) {
    const closedNames = closed.map((k) => t(lang, WEEKDAY_NAME_KEYS[k] as 'weekday_mon')).join(', ');
    parts.push(t(lang, 'appointment_schedule_closed', { days: closedNames }));
  }

  return parts.join('; ');
}
