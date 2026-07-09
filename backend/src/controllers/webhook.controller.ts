/**
 * WhatsApp webhook controller
 * Handles Meta Cloud API webhook verification and incoming messages
 */

import { Request, Response } from 'express';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { processWebhook as defaultProcessWebhook } from '../whatsapp/whatsapp.service';
import { verifyMetaWebhookSignature } from '../whatsapp/webhook-signature';

/** Overridable in tests */
export const webhookDeps = {
  processWebhook: defaultProcessWebhook,
  resolveAppSecret: resolveWebhookAppSecret,
};

type WebhookPayloadCandidate = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: {
          phone_number_id?: unknown;
        };
      };
    }>;
  }>;
};

function getGlobalAppSecret(): string | undefined {
  return config.whatsapp.appSecret || process.env.WHATSAPP_APP_SECRET?.trim() || undefined;
}

function extractPhoneNumberIds(payload: unknown): string[] {
  const ids = new Set<string>();
  const candidate = payload as WebhookPayloadCandidate;

  for (const entry of candidate.entry || []) {
    for (const change of entry.changes || []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (typeof phoneNumberId === 'string' && phoneNumberId.trim()) {
        ids.add(phoneNumberId.trim());
      }
    }
  }

  return [...ids];
}

async function resolveWebhookAppSecret(payload: unknown): Promise<string | undefined> {
  const phoneNumberIds = extractPhoneNumberIds(payload);
  if (!phoneNumberIds.length) return getGlobalAppSecret();

  const { data, error } = await adminClient
    .from('whatsapp_configs')
    .select('app_secret')
    .in('business_account_id', phoneNumberIds)
    .eq('status', 'connected');

  if (error) {
    console.warn(`[Webhook] App secret lookup failed: ${error.message}`);
    return getGlobalAppSecret();
  }

  const accountSecret = (data || [])
    .map((row) => (row.app_secret as string | null | undefined)?.trim())
    .find(Boolean);

  return accountSecret || getGlobalAppSecret();
}

export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    console.log('WhatsApp webhook verified');
    res.status(200).send(challenge);
    return;
  }

  res.status(403).json({ error: 'Verification failed' });
}

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const appSecret = await webhookDeps.resolveAppSecret(req.body);
  const verification = verifyMetaWebhookSignature(
    req.rawBody,
    req.headers['x-hub-signature-256'],
    appSecret
  );

  if (!verification.ok) {
    console.warn(`[Webhook] Rejected POST from ${clientIp}: ${verification.reason}`);
    res.status(401).send('Unauthorized');
    return;
  }

  res.status(200).send('EVENT_RECEIVED');

  try {
    await webhookDeps.processWebhook(req.body);
  } catch (error) {
    console.error('Webhook processing error:', error);
  }
}
