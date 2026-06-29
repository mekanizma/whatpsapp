/**
 * WhatsApp webhook controller
 * Handles Meta Cloud API webhook verification and incoming messages
 */

import { Request, Response } from 'express';
import { config } from '../config';
import { processWebhook } from '../whatsapp/whatsapp.service';

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
  res.status(200).send('EVENT_RECEIVED');

  try {
    await processWebhook(req.body);
  } catch (error) {
    console.error('Webhook processing error:', error);
  }
}
