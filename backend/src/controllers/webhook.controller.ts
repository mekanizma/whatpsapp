/**
 * WhatsApp webhook controller
 * Handles Meta Cloud API webhook verification and incoming messages
 */

import { Request, Response } from 'express';
import { config } from '../config';
import { processWebhook as defaultProcessWebhook } from '../whatsapp/whatsapp.service';
import { verifyMetaWebhookSignature } from '../whatsapp/webhook-signature';

/** Overridable in tests */
export const webhookDeps = {
  processWebhook: defaultProcessWebhook,
};

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
  const appSecret =
    config.whatsapp.appSecret ||
    process.env.WHATSAPP_APP_SECRET?.trim() ||
    undefined;
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
