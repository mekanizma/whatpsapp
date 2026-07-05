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

function getLocalPartsInTimezone(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));

  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Şirket saat diliminde bugünün 00:00 anına karşılık gelen UTC Date */
export function getStartOfTodayInTimezone(timeZone: string, ref: Date = new Date()): Date {
  const tz = parseCompanyTimezone(timeZone);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(ref);
  const [year, month, day] = ymd.split('-').map((v) => parseInt(v, 10));

  const target = { year, month, day, hour: 0, minute: 0, second: 0 };
  let guess = Date.UTC(year, month - 1, day, 0, 0, 0);

  for (let i = 0; i < 48; i++) {
    const local = getLocalPartsInTimezone(guess, tz);
    const diff =
      (local.year - target.year) * 31 * 86400000 +
      (local.month - target.month) * 86400000 +
      (local.day - target.day) * 86400000 +
      local.hour * 3600000 +
      local.minute * 60000 +
      local.second * 1000;

    if (diff === 0) return new Date(guess);
    guess -= diff;
  }

  return new Date(guess);
}
