/**
 * Meta OAuth — her firma kendi Facebook hesabıyla giriş yapar;
 * erişebildiği tüm Facebook Sayfaları + bağlı Instagram hesapları otomatik bağlanır.
 * Müşteri webhook / sayfa seçimi yapmaz (platform Meta App + ortak webhook).
 */

import crypto from 'crypto';
import { config } from '../../config';
import {
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  fetchUserPages,
  buildMetaOAuthUrl,
  subscribePageToWebhooks,
  type MetaPageSummary,
} from './meta-graph.service';
import {
  upsertChannelConnection,
  updateConnectionFields,
  listChannelConnections,
  deleteChannelConnection,
} from '../channel-connection.service';
import type { MessagingChannel } from '../types';

export type MetaOAuthMode = 'all' | 'facebook_messenger' | 'instagram_dm';

interface OAuthStatePayload {
  companyId: string;
  mode: MetaOAuthMode;
  nonce: string;
  exp: number;
}

export interface MetaAutoConnectResult {
  companyId: string;
  messengerCount: number;
  instagramCount: number;
  pages: Array<{ id: string; name: string; hasInstagram: boolean }>;
  errors: string[];
}

const pendingStates = new Map<string, OAuthStatePayload>();

function signState(payload: OAuthStatePayload): string {
  const secret = config.meta.appSecret || config.whatsapp.verifyToken;
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyState(state: string): OAuthStatePayload | null {
  const secret = config.meta.appSecret || config.whatsapp.verifyToken;
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const raw = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload & {
      channel?: MessagingChannel;
    };
    if (!raw.exp || Date.now() > raw.exp) return null;
    // Back-compat: older states used `channel`
    const mode: MetaOAuthMode =
      raw.mode ||
      (raw.channel === 'facebook_messenger' || raw.channel === 'instagram_dm'
        ? raw.channel
        : 'all');
    return { companyId: raw.companyId, mode, nonce: raw.nonce, exp: raw.exp };
  } catch {
    return null;
  }
}

export function isMetaOAuthConfigured(): boolean {
  return Boolean(config.meta.appId && config.meta.appSecret && config.meta.redirectUri);
}

export function getMetaOAuthStartUrl(
  companyId: string,
  mode: MetaOAuthMode = 'all'
): { url: string } | { error: string } {
  if (!isMetaOAuthConfigured()) {
    return {
      error:
        'Meta OAuth yapılandırılmamış. META_APP_ID, META_APP_SECRET ve META_REDIRECT_URI tanımlayın.',
    };
  }

  const payload: OAuthStatePayload = {
    companyId,
    mode,
    nonce: crypto.randomBytes(8).toString('hex'),
    exp: Date.now() + 15 * 60 * 1000,
  };
  const state = signState(payload);
  pendingStates.set(state, payload);
  if (pendingStates.size > 500) {
    const oldest = pendingStates.keys().next().value;
    if (oldest) pendingStates.delete(oldest);
  }

  return { url: buildMetaOAuthUrl(config.meta.redirectUri, state) };
}

async function findExistingForPage(
  companyId: string,
  channel: MessagingChannel,
  pageId: string
) {
  const rows = await listChannelConnections(companyId, channel);
  return (
    rows.find((r) => r.external_page_id === pageId) ||
    rows.find((r) => r.status === 'pending') ||
    null
  );
}

async function connectPageChannel(params: {
  companyId: string;
  channel: MessagingChannel;
  page: MetaPageSummary;
}): Promise<{ ok: true; connectionId: string } | { ok: false; error: string }> {
  const { companyId, channel, page } = params;
  const ig = page.instagram_business_account;

  if (channel === 'instagram_dm' && !ig?.id) {
    return { ok: false, error: `${page.name}: Instagram Business hesabı yok` };
  }

  await subscribePageToWebhooks(page.id, page.access_token);

  const existing = await findExistingForPage(companyId, channel, page.id);
  const fields = {
    channel,
    status: 'connected' as const,
    label: channel === 'instagram_dm' ? ig?.username || page.name : page.name,
    external_page_id: page.id,
    page_name: page.name,
    account_name: channel === 'instagram_dm' ? ig?.username || page.name : page.name,
    external_ig_user_id: channel === 'instagram_dm' ? ig?.id || null : null,
    access_token: page.access_token,
    inbound_enabled: true,
    is_active: true,
    connected_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    last_error: null,
    metadata: {
      linked_page_id: page.id,
      ig_user_id: ig?.id || null,
      ig_username: ig?.username || null,
      auto_linked: true,
    },
  };

  const saved = existing?.id
    ? await updateConnectionFields(companyId, existing.id, fields)
    : await upsertChannelConnection(companyId, fields);

  if (!saved) return { ok: false, error: `${page.name}: kayıt başarısız` };
  return { ok: true, connectionId: saved.id };
}

/** Tüm yetkili sayfaları Messenger (+ varsa IG) olarak otomatik bağla */
export async function autoConnectMetaPages(
  companyId: string,
  pages: MetaPageSummary[],
  mode: MetaOAuthMode = 'all'
): Promise<MetaAutoConnectResult> {
  const result: MetaAutoConnectResult = {
    companyId,
    messengerCount: 0,
    instagramCount: 0,
    pages: pages.map((p) => ({
      id: p.id,
      name: p.name,
      hasInstagram: Boolean(p.instagram_business_account?.id),
    })),
    errors: [],
  };

  if (!pages.length) {
    result.errors.push(
      'Hesabınıza bağlı Facebook Sayfası bulunamadı. Meta Business’te bir sayfa oluşturup bu hesaba yönetici yetkisi verin.'
    );
    return result;
  }

  for (const page of pages) {
    const wantMessenger = mode === 'all' || mode === 'facebook_messenger';
    const wantInstagram = mode === 'all' || mode === 'instagram_dm';

    if (wantMessenger) {
      const linked = await connectPageChannel({
        companyId,
        channel: 'facebook_messenger',
        page,
      });
      if (linked.ok) result.messengerCount += 1;
      else result.errors.push(linked.error);
    }

    if (wantInstagram && page.instagram_business_account?.id) {
      const linked = await connectPageChannel({
        companyId,
        channel: 'instagram_dm',
        page,
      });
      if (linked.ok) result.instagramCount += 1;
      else result.errors.push(linked.error);
    } else if (wantInstagram && mode === 'instagram_dm' && !page.instagram_business_account?.id) {
      result.errors.push(`${page.name}: Instagram Business hesabı bağlı değil`);
    }
  }

  // Temizlik: kalan pending OAuth stub’larını sil
  const leftovers = await listChannelConnections(companyId);
  for (const row of leftovers) {
    if (
      row.status === 'pending' &&
      (row.metadata as { oauth_pending?: boolean })?.oauth_pending
    ) {
      await deleteChannelConnection(companyId, row.id);
    }
  }

  return result;
}

export async function completeMetaOAuth(
  code: string,
  state: string
): Promise<
  | { ok: true; result: MetaAutoConnectResult }
  | { ok: false; error: string }
> {
  const payload = verifyState(state);
  if (!payload) return { ok: false, error: 'OAuth state geçersiz veya süresi dolmuş' };

  pendingStates.delete(state);

  try {
    const shortLived = await exchangeCodeForUserToken(code, config.meta.redirectUri);
    const longLived = await exchangeForLongLivedUserToken(shortLived.access_token);
    const pages = await fetchUserPages(longLived.access_token);

    const result = await autoConnectMetaPages(payload.companyId, pages, payload.mode);

    if (result.messengerCount === 0 && result.instagramCount === 0) {
      return {
        ok: false,
        error:
          result.errors[0] ||
          'Hiçbir Messenger / Instagram hesabı bağlanamadı. Sayfa ve IG yetkilerini kontrol edin.',
      };
    }

    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OAuth tamamlanamadı';
    console.error('[Meta OAuth]', message);
    return { ok: false, error: message };
  }
}

/** Manuel link — opsiyonel geriye uyumluluk */
export async function linkSelectedMetaPage(params: {
  companyId: string;
  channel: MessagingChannel;
  pageId: string;
  label?: string;
}): Promise<{ ok: true; connectionId: string } | { ok: false; error: string }> {
  const shortLivedTokenRows = await listChannelConnections(params.companyId);
  // Re-fetch pages requires user token; for manual flow we only support reconnection via full OAuth now
  void shortLivedTokenRows;
  void params.label;
  return {
    ok: false,
    error: 'Sayfa seçimi kaldırıldı. Meta ile Bağlan butonunu kullanın; hesaplar otomatik bağlanır.',
  };
}

export function getPendingPagesForCompany(): Promise<[]> {
  return Promise.resolve([]);
}
