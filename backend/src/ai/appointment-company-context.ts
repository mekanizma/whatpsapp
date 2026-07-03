/**
 * Appointment flow context — timezone + working hours loaded once per request
 */

import { parseWorkingHoursForRuntime, type WorkingHoursSchedule } from '../services/working-hours.service';
import {
  DEFAULT_COMPANY_TIMEZONE,
  parseCompanyTimezone,
} from '../services/company-timezone.service';

export interface AppointmentCompanyContext {
  timezone: string;
  schedule: WorkingHoursSchedule;
  /** Test / replay hook — defaults to now when parsing relative dates */
  parseRef?: Date;
}

export const DEFAULT_APPOINTMENT_CONTEXT: AppointmentCompanyContext = {
  timezone: DEFAULT_COMPANY_TIMEZONE,
  schedule: parseWorkingHoursForRuntime(null),
};

export function buildAppointmentCompanyContext(
  workingHours: unknown,
  timezone: unknown
): AppointmentCompanyContext {
  return {
    timezone: parseCompanyTimezone(timezone),
    schedule: parseWorkingHoursForRuntime(workingHours),
  };
}
