/**
 * Müşteri görüşme birimi sayımı — mesaj geçmişinden türetilir.
 *
 * Kurallar (kişi = customer_phone):
 * - 12 saatten uzun aralık → yeni oturum
 * - Oturum başına her 50 müşteri mesajı = 1 görüşme (51 → 2, 101 → 3)
 */

import { adminClient } from '../database/supabase';
import { getStartOfTodayInTimezone, parseCompanyTimezone } from './company-timezone.service';

export const MESSAGES_PER_CONVERSATION = 50;
export const SESSION_GAP_MS = 12 * 60 * 60 * 1000;

export interface CustomerMessageRow {
  customer_phone: string;
  created_at: string | Date;
}

function isConversationOpeningAtIndex(timestamps: number[], index: number): boolean {
  if (index === 0) return true;
  if (timestamps[index] - timestamps[index - 1] > SESSION_GAP_MS) return true;

  let sessionCount = 1;
  for (let j = index; j > 0; j--) {
    if (timestamps[j] - timestamps[j - 1] > SESSION_GAP_MS) break;
    sessionCount++;
  }
  return (sessionCount - 1) % MESSAGES_PER_CONVERSATION === 0;
}

/** Tek müşterinin kronolojik müşteri mesajlarından toplam görüşme birimi */
export function countConversationUnitsForCustomer(sortedTimestamps: Date[]): number {
  if (sortedTimestamps.length === 0) return 0;

  const times = sortedTimestamps.map((d) => d.getTime());
  let total = 0;

  for (let i = 0; i < times.length; i++) {
    if (isConversationOpeningAtIndex(times, i)) total++;
  }

  return total;
}

/** Son müşteri mesajı yeni bir görüşme birimi açıyor mu? (mesaj DB'ye yazıldıktan sonra) */
export function isNewConversationUnit(sortedTimestamps: Date[]): boolean {
  if (sortedTimestamps.length === 0) return false;
  const times = sortedTimestamps.map((d) => d.getTime());
  return isConversationOpeningAtIndex(times, times.length - 1);
}

export function countConversationUnitsFromRows(rows: CustomerMessageRow[]): number {
  const byPhone = groupCustomerTimestamps(rows);
  let total = 0;
  for (const timestamps of byPhone.values()) {
    total += countConversationUnitsForCustomer(timestamps);
  }
  return total;
}

export function countTodayConversationUnitsFromRows(
  rows: CustomerMessageRow[],
  todayStart: Date = startOfToday()
): number {
  const todayMs = todayStart.getTime();
  const byPhone = groupCustomerTimestamps(rows);
  let total = 0;

  for (const timestamps of byPhone.values()) {
    const times = timestamps.map((d) => d.getTime());
    for (let i = 0; i < times.length; i++) {
      if (times[i] >= todayMs && isConversationOpeningAtIndex(times, i)) {
        total++;
      }
    }
  }

  return total;
}

export function countConversationUnitsByCompany(
  rows: CustomerMessageRow[]
): Record<string, number> {
  const grouped = new Map<string, CustomerMessageRow[]>();

  for (const row of rows) {
    const companyId = (row as CustomerMessageRow & { company_id?: string }).company_id;
    if (!companyId) continue;
    const list = grouped.get(companyId) || [];
    list.push(row);
    grouped.set(companyId, list);
  }

  const result: Record<string, number> = {};
  for (const [companyId, companyRows] of grouped) {
    result[companyId] = countConversationUnitsFromRows(companyRows);
  }
  return result;
}

function groupCustomerTimestamps(rows: CustomerMessageRow[]): Map<string, Date[]> {
  const byPhone = new Map<string, Date[]>();

  for (const row of rows) {
    const phone = row.customer_phone;
    if (!phone) continue;
    const list = byPhone.get(phone) || [];
    list.push(new Date(row.created_at));
    byPhone.set(phone, list);
  }

  for (const [phone, timestamps] of byPhone) {
    timestamps.sort((a, b) => a.getTime() - b.getTime());
    byPhone.set(phone, timestamps);
  }

  return byPhone;
}

function startOfToday(timeZone?: string): Date {
  if (timeZone) return getStartOfTodayInTimezone(timeZone);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export async function getConversationStatsForCompany(companyId: string): Promise<{
  total_conversations: number;
  today_conversations: number;
}> {
  const [{ data, error }, { data: company, error: companyError }] = await Promise.all([
    adminClient
      .from('messages')
      .select('customer_phone, created_at')
      .eq('company_id', companyId)
      .eq('sender_type', 'customer'),
    adminClient.from('companies').select('timezone').eq('id', companyId).single(),
  ]);

  if (error) throw new Error(error.message);
  if (companyError) throw new Error(companyError.message);

  const rows = (data || []) as CustomerMessageRow[];
  const todayStart = startOfToday(parseCompanyTimezone(company?.timezone));
  return {
    total_conversations: countConversationUnitsFromRows(rows),
    today_conversations: countTodayConversationUnitsFromRows(rows, todayStart),
  };
}

export async function getCustomerMessageTimestamps(
  companyId: string,
  customerPhone: string
): Promise<Date[]> {
  const { data, error } = await adminClient
    .from('messages')
    .select('created_at')
    .eq('company_id', companyId)
    .eq('customer_phone', customerPhone)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map((m) => new Date(m.created_at));
}

export async function shouldIncrementConversationUsage(
  companyId: string,
  customerPhone: string
): Promise<boolean> {
  const timestamps = await getCustomerMessageTimestamps(companyId, customerPhone);
  return isNewConversationUnit(timestamps);
}

export async function getPlatformConversationCount(): Promise<number> {
  const { data, error } = await adminClient
    .from('messages')
    .select('company_id, customer_phone, created_at')
    .eq('sender_type', 'customer');

  if (error) throw new Error(error.message);
  return countConversationUnitsFromRows((data || []) as CustomerMessageRow[]);
}

export async function getConversationCountsByCompany(
  companyIds: string[]
): Promise<Record<string, number>> {
  if (!companyIds.length) return {};

  const { data, error } = await adminClient
    .from('messages')
    .select('company_id, customer_phone, created_at')
    .in('company_id', companyIds)
    .eq('sender_type', 'customer');

  if (error) throw new Error(error.message);

  return countConversationUnitsByCompany(
    (data || []) as (CustomerMessageRow & { company_id: string })[]
  );
}
