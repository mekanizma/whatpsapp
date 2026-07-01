/**
 * Ay başı UTC-normalize tarih yardımcıları
 */

export function getMonthStartDate(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getMonthStartISO(): string {
  return getMonthStartDate().toISOString();
}
