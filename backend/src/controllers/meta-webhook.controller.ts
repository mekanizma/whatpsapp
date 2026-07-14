/**
 * Meta (Messenger + Instagram) webhook controller
 */

import { Request, Response } from 'express';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { verifyMetaWebhookSignature } from '../whatsapp/webhook-signature';
import {
  processMetaWebhook,
  extractMetaPageIds,
} from '../channels/meta/meta-webhook.service';

function getGlobalAppSecret(): string | undefined {
  return (
    config.meta.appSecret ||
    config.whatsapp.appSecret ||
    process.env.WHATSAPP_APP_SECRET?.trim() ||
    undefined
  );
}

async function resolveMetaAppSecret(payload: unknown): Promise<string | undefined> {
  const pageIds = extractMetaPageIds(payload);
  if (!pageIds.length) return getGlobalAppSecret();

  const { data, error } = await adminClient
    .from('channel_connections')
    .select('id')
    .or(
      `external_page_id.in.(${pageIds.join(',')}),external_ig_user_id.in.(${pageIds.join(',')})`
    )
    .eq('status', 'connected')
    .limit(1);

  if (error) {
    console.warn(`[Meta Webhook] Lookup failed: ${error.message}`);
  }

  // Per-connection app secrets are not stored; use platform Meta app secret
  void data;
  return getGlobalAppSecret();
}

export function verifyMetaWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expected =
    config.meta.verifyToken || config.whatsapp.verifyToken;

  if (mode === 'subscribe' && token === expected) {
    console.log('Meta webhook verified');
    res.status(200).send(challenge);
    return;
  }

  res.status(403).json({ error: 'Verification failed' });
}

export async function handleMetaWebhook(req: Request, res: Response): Promise<void> {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const appSecret = await resolveMetaAppSecret(req.body);
  const verification = verifyMetaWebhookSignature(
    req.rawBody,
    req.headers['x-hub-signature-256'],
    appSecret
  );

  if (!verification.ok) {
    console.warn(`[Meta Webhook] Rejected POST from ${clientIp}: ${verification.reason}`);
    res.status(401).send('Unauthorized');
    return;
  }

  res.status(200).send('EVENT_RECEIVED');

  try {
    await processMetaWebhook(req.body);
  } catch (error) {
    console.error('Meta webhook processing error:', error);
  }
}
