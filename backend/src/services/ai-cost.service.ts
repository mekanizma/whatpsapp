/**
 * AI maliyet raporu — günlük kullanım loglarından özet
 */

import { adminClient } from '../database/supabase';
import { config } from '../config';

export interface AICostDailyRow {
  date: string;
  total_calls: number;
  skipped_gate: number;
  cache_hits: number;
  prompt_tokens: number;
  cached_tokens: number;
  completion_tokens: number;
}

export interface AICostReport {
  company_id: string;
  days: number;
  totals: Omit<AICostDailyRow, 'date'>;
  daily: AICostDailyRow[];
}

function emptyTotals(): Omit<AICostDailyRow, 'date'> {
  return {
    total_calls: 0,
    skipped_gate: 0,
    cache_hits: 0,
    prompt_tokens: 0,
    cached_tokens: 0,
    completion_tokens: 0,
  };
}

function addRow(
  target: Omit<AICostDailyRow, 'date'>,
  row: Omit<AICostDailyRow, 'date'>
): void {
  target.total_calls += row.total_calls;
  target.skipped_gate += row.skipped_gate;
  target.cache_hits += row.cache_hits;
  target.prompt_tokens += row.prompt_tokens;
  target.cached_tokens += row.cached_tokens;
  target.completion_tokens += row.completion_tokens;
}

export async function getAICostReport(
  companyId: string,
  days = 30
): Promise<AICostReport> {
  const safeDays = Math.min(Math.max(days, 1), 90);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (safeDays - 1));
  since.setUTCHours(0, 0, 0, 0);

  if (config.demoMode) {
    return {
      company_id: companyId,
      days: safeDays,
      totals: emptyTotals(),
      daily: [],
    };
  }

  const { data, error } = await adminClient
    .from('ai_usage_logs')
    .select(
      'created_at, skipped, cached, skip_reason, prompt_tokens, completion_tokens, cached_tokens'
    )
    .eq('company_id', companyId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const byDay = new Map<string, Omit<AICostDailyRow, 'date'>>();

  for (const row of data || []) {
    const day = String(row.created_at).slice(0, 10);
    const bucket = byDay.get(day) || emptyTotals();

    bucket.total_calls += 1;
    if (row.skipped && row.skip_reason !== 'response_cache') {
      bucket.skipped_gate += 1;
    }
    if (row.cached || row.skip_reason === 'response_cache') {
      bucket.cache_hits += 1;
    }
    bucket.prompt_tokens += row.prompt_tokens || 0;
    bucket.cached_tokens += row.cached_tokens || 0;
    bucket.completion_tokens += row.completion_tokens || 0;

    byDay.set(day, bucket);
  }

  const daily: AICostDailyRow[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stats]) => ({ date, ...stats }));

  const totals = emptyTotals();
  for (const row of daily) {
    addRow(totals, row);
  }

  return {
    company_id: companyId,
    days: safeDays,
    totals,
    daily,
  };
}
