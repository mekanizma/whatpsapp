/**
 * Meta Graph API helpers (Messenger + Instagram Messaging)
 */

import { config } from '../../config';
import type { OutboundSendResult } from '../types';

const graphBase = () => config.meta.baseUrl;

export interface MetaTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface MetaPageSummary {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
}

export async function exchangeCodeForUserToken(
  code: string,
  redirectUri: string
): Promise<MetaTokenResponse> {
  const url = new URL(`${graphBase()}/oauth/access_token`);
  url.searchParams.set('client_id', config.meta.appId);
  url.searchParams.set('client_secret', config.meta.appSecret);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code', code);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Meta token exchange failed: ${body || res.status}`);
  }
  return (await res.json()) as MetaTokenResponse;
}

export async function exchangeForLongLivedUserToken(
  shortLivedToken: string
): Promise<MetaTokenResponse> {
  const url = new URL(`${graphBase()}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', config.meta.appId);
  url.searchParams.set('client_secret', config.meta.appSecret);
  url.searchParams.set('fb_exchange_token', shortLivedToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Meta long-lived token exchange failed: ${body || res.status}`);
  }
  return (await res.json()) as MetaTokenResponse;
}

export async function fetchUserPages(userAccessToken: string): Promise<MetaPageSummary[]> {
  const url = new URL(`${graphBase()}/me/accounts`);
  url.searchParams.set(
    'fields',
    'id,name,access_token,instagram_business_account{id,username}'
  );
  url.searchParams.set('access_token', userAccessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Meta pages fetch failed: ${body || res.status}`);
  }
  const data = (await res.json()) as { data?: MetaPageSummary[] };
  return data.data || [];
}

export async function subscribePageToWebhooks(
  pageId: string,
  pageAccessToken: string
): Promise<boolean> {
  try {
    const res = await fetch(`${graphBase()}/${pageId}/subscribed_apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscribed_fields: ['messages', 'messaging_postbacks', 'message_deliveries'],
        access_token: pageAccessToken,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[Meta] Page subscribe failed (${pageId}):`, body);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Meta] Page subscribe error:', err);
    return false;
  }
}

export async function sendMessengerText(
  pageId: string,
  pageAccessToken: string,
  recipientId: string,
  text: string
): Promise<OutboundSendResult> {
  try {
    const res = await fetch(`${graphBase()}/${pageId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: { text },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { success: false, error: errBody || 'Meta mesaj gönderilemedi' };
    }
    const data = (await res.json()) as { message_id?: string };
    return { success: true, providerMessageId: data.message_id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Meta mesaj gönderilemedi',
    };
  }
}

export async function sendMessengerImageUrl(
  pageId: string,
  pageAccessToken: string,
  recipientId: string,
  imageUrl: string,
  caption?: string
): Promise<OutboundSendResult> {
  try {
    const message: Record<string, unknown> = {
      attachment: {
        type: 'image',
        payload: { url: imageUrl, is_reusable: true },
      },
    };
    // Caption as separate text when present (Messenger image attachments have no caption field)
    if (caption?.trim()) {
      await sendMessengerText(pageId, pageAccessToken, recipientId, caption.trim());
    }

    const res = await fetch(`${graphBase()}/${pageId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { success: false, error: errBody || 'Meta görsel gönderilemedi' };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Meta görsel gönderilemedi',
    };
  }
}

export async function downloadMetaAttachment(
  url: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      buffer,
      mimeType: res.headers.get('content-type') || 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

export function buildMetaOAuthUrl(redirectUri: string, state: string): string {
  const url = new URL(`https://www.facebook.com/${config.meta.apiVersion}/dialog/oauth`);
  url.searchParams.set('client_id', config.meta.appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set(
    'scope',
    [
      'pages_show_list',
      'pages_messaging',
      'pages_manage_metadata',
      'pages_read_engagement',
      'instagram_basic',
      'instagram_manage_messages',
      'business_management',
    ].join(',')
  );
  url.searchParams.set('response_type', 'code');
  return url.toString();
}
