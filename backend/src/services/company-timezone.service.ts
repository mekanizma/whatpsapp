/**
 * Per-tenant IANA timezone validation and defaults
 */

export const DEFAULT_COMPANY_TIMEZONE = 'Europe/Istanbul';

function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function parseCompanyTimezone(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    return DEFAULT_COMPANY_TIMEZONE;
  }
  const tz = raw.trim();
  return isValidIanaTimezone(tz) ? tz : DEFAULT_COMPANY_TIMEZONE;
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
  if (!isValidIanaTimezone(tz)) {
    return { ok: false, error: `Invalid timezone: ${tz}` };
  }
  return { ok: true, timezone: tz };
}
