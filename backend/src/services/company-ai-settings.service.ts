/**
 * Şirket + WhatsApp hattı düzeyinde AI açık/kapalı ve özel talimat çözümleme
 */

import { adminClient } from '../database/supabase';
import { AI_DISABLED_TICKET_SUBJECT } from '../ai/transfer.service';

const CACHE_TTL_MS = 60_000;

const companyCache = new Map<string, { enabled: boolean; expires: number }>();
const accountSettingsCache = new Map<
  string,
  { value: ResolvedAccountAiSettings; expires: number }
>();

export type ResolvedAccountAiSettings = {
  aiEnabled: boolean;
  /** Etkin özel talimat (hesap override veya şirket) */
  customInstructions: string | null;
  /**
   * null = tüm şirket KB; string[] = yalnızca atanan KB id'leri
   * (hiç junction satırı yoksa null)
   */
  knowledgeBaseIds: string[] | null;
};

function accountCacheKey(companyId: string, accountId: string): string {
  return `${companyId}:${accountId}`;
}

export function invalidateCompanyAiSettingsCache(companyId?: string): void {
  if (!companyId) {
    companyCache.clear();
    accountSettingsCache.clear();
    return;
  }
  companyCache.delete(companyId);
  for (const key of accountSettingsCache.keys()) {
    if (key.startsWith(`${companyId}:`)) {
      accountSettingsCache.delete(key);
    }
  }
}

export function invalidateAccountAiSettingsCache(
  companyId: string,
  accountId?: string
): void {
  if (!accountId) {
    invalidateCompanyAiSettingsCache(companyId);
    return;
  }
  accountSettingsCache.delete(accountCacheKey(companyId, accountId));
}

export async function isCompanyAiEnabled(companyId: string): Promise<boolean> {
  const cached = companyCache.get(companyId);
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
  companyCache.set(companyId, { enabled, expires: Date.now() + CACHE_TTL_MS });
  return enabled;
}

/**
 * Şirket kapalıysa her hat kapalı.
 * Şirket açıksa: hesap ai_enabled null → şirket; true/false → hesap override.
 * accountId yoksa yalnızca şirket ayarı.
 */
export async function isAiEnabledForAccount(
  companyId: string,
  accountId?: string | null
): Promise<boolean> {
  const companyEnabled = await isCompanyAiEnabled(companyId);
  if (!companyEnabled) return false;
  if (!accountId) return true;

  const resolved = await resolveAccountAiSettings(companyId, accountId);
  return resolved.aiEnabled;
}

export async function resolveAccountAiSettings(
  companyId: string,
  accountId: string
): Promise<ResolvedAccountAiSettings> {
  const key = accountCacheKey(companyId, accountId);
  const cached = accountSettingsCache.get(key);
  if (cached && Date.now() < cached.expires) {
    return cached.value;
  }

  const companyEnabled = await isCompanyAiEnabled(companyId);

  const [{ data: account }, { data: company }, { data: kbLinks }] = await Promise.all([
    adminClient
      .from('whatsapp_configs')
      .select('ai_enabled, custom_instructions')
      .eq('id', accountId)
      .eq('company_id', companyId)
      .maybeSingle(),
    adminClient
      .from('companies')
      .select('custom_instructions')
      .eq('id', companyId)
      .maybeSingle(),
    adminClient
      .from('whatsapp_account_knowledge')
      .select('knowledge_base_id')
      .eq('whatsapp_account_id', accountId)
      .eq('company_id', companyId),
  ]);

  let aiEnabled = companyEnabled;
  if (companyEnabled && account && account.ai_enabled !== null && account.ai_enabled !== undefined) {
    aiEnabled = account.ai_enabled === true;
  }

  const accountInstructions =
    typeof account?.custom_instructions === 'string' ? account.custom_instructions.trim() : '';
  const companyInstructions =
    typeof company?.custom_instructions === 'string' ? company.custom_instructions.trim() : '';

  const customInstructions = accountInstructions
    ? accountInstructions
    : companyInstructions || null;

  const linkIds = (kbLinks || [])
    .map((row) => row.knowledge_base_id as string)
    .filter(Boolean);
  const knowledgeBaseIds = linkIds.length > 0 ? linkIds : null;

  const value: ResolvedAccountAiSettings = {
    aiEnabled,
    customInstructions,
    knowledgeBaseIds,
  };

  accountSettingsCache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

/** AI yeniden açıldığında otomatik açılan talepleri kapat — botun yanıt vermesini engellemez */
export async function closeOpenAiDisabledTickets(companyId: string): Promise<number> {
  const closedAt = new Date().toISOString();
  const { data, error } = await adminClient
    .from('tickets')
    .update({ status: 'closed', closed_at: closedAt })
    .eq('company_id', companyId)
    .eq('subject', AI_DISABLED_TICKET_SUBJECT)
    .eq('status', 'open')
    .select('id');

  if (error) {
    console.error(`[AI Settings] ai_disabled talepleri kapatılamadı (${companyId}):`, error.message);
    return 0;
  }

  const count = data?.length || 0;
  if (count > 0) {
    console.log(`[AI Settings] AI açıldı — ${count} otomatik talep kapatıldı (${companyId})`);
  }
  return count;
}
