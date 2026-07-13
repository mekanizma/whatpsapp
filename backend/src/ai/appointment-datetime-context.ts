/**
 * Randevu prompt placeholder'ları — her AI çağrısında taze tarih/saat
 */

import { ConversationLang } from './language.service';
import {
  companyDateParts,
  companyTimeParts,
  localToUtcInTimezone,
  slotWeekday,
} from './appointment-slot.service';
import { formatWeekdayName } from '../services/working-hours.service';
import { appointmentConfig } from '../config/appointment.config';

export interface DateTimePlaceholders {
  currentDate: string;
  currentDayName: string;
  currentTime: string;
}

export function buildDateTimePlaceholders(
  timezone: string,
  lang: ConversationLang = 'tr',
  ref: Date = new Date()
): DateTimePlaceholders {
  const tz = timezone || appointmentConfig.referenceTimezone;
  const parts = companyDateParts(ref, tz);
  const timeParts = companyTimeParts(ref, tz);
  const isoDate = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  const wd = slotWeekday(localNoonUtc(parts, tz).toISOString(), tz);

  return {
    currentDate: isoDate,
    currentDayName: formatWeekdayName(lang, wd),
    currentTime: `${String(timeParts.hour).padStart(2, '0')}:${String(timeParts.minute).padStart(2, '0')}`,
  };
}

function localNoonUtc(
  parts: { year: number; month: number; day: number },
  timeZone: string
): Date {
  return localToUtcInTimezone(parts.year, parts.month, parts.day, 12, 0, timeZone);
}
