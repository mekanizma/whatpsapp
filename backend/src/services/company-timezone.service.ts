/**
 * Per-tenant IANA timezone validation and defaults
 */

export const DEFAULT_COMPANY_TIMEZONE = 'Europe/Istanbul';

const SUPPORTED_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

export function parseCompanyTimezone(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    return DEFAULT_COMPANY_TIMEZONE;
  }
  const tz = raw.trim();
  return SUPPORTED_TIMEZONES.has(tz) ? tz : DEFAULT_COMPANY_TIMEZONE;
}

export function validateCompanyTimezoneForWrite(
  raw: unknown
): { ok: true; timezone: string } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, timezone: DEFAULT_COMPANY_TIMEZONE };
  }
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, error: 'timezone must be a non-empty IANA timezone string' };
  }
  const tz = raw.trim();
  if (!SUPPORTED_TIMEZONES.has(tz)) {
    return { ok: false, error: `Invalid timezone: ${tz}` };
  }
  return { ok: true, timezone: tz };
}
