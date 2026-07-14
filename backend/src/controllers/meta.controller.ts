/**
 * Meta channel management (OAuth, connections, test message)
 */

import { Response } from 'express';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
import { config } from '../config';
import {
  listChannelConnections,
  getChannelConnection,
  updateConnectionFields,
  deleteChannelConnection,
  toPublicConnection,
} from '../channels/channel-connection.service';
import {
  getMetaOAuthStartUrl,
  completeMetaOAuth,
  isMetaOAuthConfigured,
  type MetaOAuthMode,
} from '../channels/meta/meta-oauth.service';
import { getMetaMessageChannel } from '../channels/meta/meta.channel';
import { buildCustomerExternalId } from '../channels/customer-id';
import type { MessagingChannel } from '../channels/types';

function parseChannel(raw: unknown): MessagingChannel | null {
  if (raw === 'facebook_messenger' || raw === 'instagram_dm') return raw;
  return null;
}

function parseOAuthMode(raw: unknown): MetaOAuthMode {
  if (raw === 'facebook_messenger' || raw === 'instagram_dm') return raw;
  return 'all';
}

export async function listMetaConnections(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({ success: true, data: { connections: [], oauth_configured: false } });
    return;
  }

  const channel = parseChannel(req.query.channel) || undefined;
  const rows = await listChannelConnections(req.companyId!, channel);
  const active = rows.filter((r) => r.status !== 'pending');
  res.json({
    success: true,
    data: {
      connections: active.map(toPublicConnection),
      oauth_configured: isMetaOAuthConfigured(),
      meta_app_id: config.meta.appId || null,
      connected_messenger: active.some(
        (r) => r.channel === 'facebook_messenger' && r.status === 'connected' && r.is_active
      ),
      connected_instagram: active.some(
        (r) => r.channel === 'instagram_dm' && r.status === 'connected' && r.is_active
      ),
    },
  });
}

export async function startMetaOAuth(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.status(403).json({ success: false, error: 'Demo oturumunda Meta bağlanamaz' });
    return;
  }

  // Varsayılan: tek girişte hem Messenger hem Instagram
  const mode = parseOAuthMode(req.body?.mode ?? req.body?.channel ?? 'all');
  const result = getMetaOAuthStartUrl(req.companyId!, mode);
  if ('error' in result) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }

  res.json({ success: true, data: { url: result.url } });
}

/** OAuth redirect callback (no auth — state is signed) */
export async function metaOAuthCallback(req: AuthRequest, res: Response): Promise<void> {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const error = typeof req.query.error === 'string' ? req.query.error : '';

  const frontendBase =
    config.cors.origins.find((o) => !o.includes('localhost') || config.isDev) ||
    config.publicUrl ||
    'http://localhost:5173';

  if (error || !code || !state) {
    res.redirect(
      `${frontendBase}/panel/meta?oauth=error&reason=${encodeURIComponent(error || 'missing_code')}`
    );
    return;
  }

  const result = await completeMetaOAuth(code, state);
  if (!result.ok) {
    res.redirect(
      `${frontendBase}/panel/meta?oauth=error&reason=${encodeURIComponent(result.error)}`
    );
    return;
  }

  const { messengerCount, instagramCount } = result.result;
  res.redirect(
    `${frontendBase}/panel/meta?oauth=success&messenger=${messengerCount}&instagram=${instagramCount}`
  );
}

export async function getPendingMetaPages(_req: AuthRequest, res: Response): Promise<void> {
  res.json({ success: true, data: [] });
}

export async function linkMetaPage(_req: AuthRequest, res: Response): Promise<void> {
  res.status(410).json({
    success: false,
    error: 'Sayfa seçimi kaldırıldı. Meta ile Bağlan ile hesaplar otomatik bağlanır.',
  });
}

function asParamId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export async function updateMetaConnection(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.status(403).json({ success: false, error: 'Demo oturumunda işlem yapılamaz' });
    return;
  }

  const connectionId = asParamId(req.params.connectionId);
  const fields: Record<string, unknown> = {};
  if (typeof req.body?.inbound_enabled === 'boolean') {
    fields.inbound_enabled = req.body.inbound_enabled;
  }
  if (typeof req.body?.is_active === 'boolean') {
    fields.is_active = req.body.is_active;
  }
  if (typeof req.body?.label === 'string') {
    fields.label = req.body.label.trim() || null;
  }

  if (!Object.keys(fields).length) {
    res.status(400).json({ success: false, error: 'Güncellenecek alan yok' });
    return;
  }

  const updated = await updateConnectionFields(req.companyId!, connectionId, fields);
  if (!updated) {
    res.status(404).json({ success: false, error: 'Bağlantı bulunamadı' });
    return;
  }

  res.json({ success: true, data: toPublicConnection(updated) });
}

export async function disconnectMetaConnection(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.status(403).json({ success: false, error: 'Demo oturumunda işlem yapılamaz' });
    return;
  }

  const connectionId = asParamId(req.params.connectionId);
  const updated = await updateConnectionFields(req.companyId!, connectionId, {
    status: 'disconnected',
    is_active: false,
    access_token: null,
    inbound_enabled: false,
    last_error: null,
  });

  if (!updated) {
    res.status(404).json({ success: false, error: 'Bağlantı bulunamadı' });
    return;
  }

  res.json({ success: true, data: toPublicConnection(updated) });
}

export async function deleteMetaConnection(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.status(403).json({ success: false, error: 'Demo oturumunda işlem yapılamaz' });
    return;
  }

  const ok = await deleteChannelConnection(req.companyId!, asParamId(req.params.connectionId));
  if (!ok) {
    res.status(404).json({ success: false, error: 'Bağlantı silinemedi' });
    return;
  }
  res.json({ success: true });
}

export async function sendMetaTestMessage(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.status(403).json({ success: false, error: 'Demo oturumunda test gönderilemez' });
    return;
  }

  const connectionId = asParamId(req.params.connectionId);
  const recipientId =
    typeof req.body?.recipient_id === 'string' ? req.body.recipient_id.trim() : '';
  const message =
    typeof req.body?.message === 'string'
      ? req.body.message.trim()
      : 'WAAI Meta entegrasyon test mesajı';

  if (!recipientId) {
    res.status(400).json({
      success: false,
      error: 'recipient_id gerekli (Messenger PSID veya Instagram IGSID)',
    });
    return;
  }

  const conn = await getChannelConnection(req.companyId!, connectionId);
  if (!conn || conn.status !== 'connected') {
    res.status(400).json({ success: false, error: 'Bağlantı aktif değil' });
    return;
  }

  const adapter = getMetaMessageChannel(conn.channel);
  const result = await adapter.sendText({
    connectionId: conn.id,
    companyId: req.companyId!,
    toExternalId: recipientId.replace(/^(fb|ig):/i, ''),
    text: message,
  });

  if (!result.success) {
    res.status(400).json({ success: false, error: result.error || 'Gönderilemedi' });
    return;
  }

  // Store test as outbound staff note in conversation thread
  const customerId = buildCustomerExternalId(conn.channel, recipientId.replace(/^(fb|ig):/i, ''));
  const { adminClient } = await import('../database/supabase');
  await adminClient.from('messages').insert({
    company_id: req.companyId!,
    customer_phone: customerId,
    customer_name: null,
    message,
    sender_type: 'staff',
    status: 'open',
    channel: conn.channel,
    channel_connection_id: conn.id,
  });

  res.json({ success: true, data: { customer_external_id: customerId } });
}
