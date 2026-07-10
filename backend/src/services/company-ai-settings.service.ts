/**
 * Şirket düzeyinde AI açık/kapalı ayarı
 */

import { adminClient } from '../database/supabase';

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { enabled: boolean; expires: number }>();

export function invalidateCompanyAiSettingsCache(companyId?: string): void {
  if (!companyId) {
    cache.clear();
    return;
  }
  cache.delete(companyId);
}

export async function isCompanyAiEnabled(companyId: string): Promise<boolean> {
  const cached = cache.get(companyId);
  if (cached && Date.now() < cached.expires) {
    return cached.enabled;
  }

  const { data, error } = await adminClient
    .from('companies')
    .select('ai_enabled')
    .eq('id', companyId)
    .single();

  if (error) {
    console.error(`[AI Settings] ai_enabled okunamadı (${companyId}):`, error.message);
    return true;
  }

  if (!data) {
    return true;
  }

  const enabled = data.ai_enabled !== false;
  cache.set(companyId, { enabled, expires: Date.now() + CACHE_TTL_MS });
  return enabled;
}
