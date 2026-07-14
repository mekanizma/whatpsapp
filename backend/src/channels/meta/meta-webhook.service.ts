/**
 * Meta Messenger + Instagram webhook payload processor
 */

import {
  findConnectionByPageId,
  findConnectionByIgUserId,
} from '../channel-connection.service';
import { buildCustomerExternalId } from '../customer-id';
import { downloadMetaAttachment } from './meta-graph.service';
import { dispatchInboundToPipeline } from './inbound-dispatch';
import type { MessagingChannel } from '../types';

interface MetaMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{
      type?: string;
      payload?: { url?: string };
    }>;
  };
  postback?: { payload?: string; title?: string };
}

interface MetaEntry {
  id?: string;
  time?: number;
  messaging?: MetaMessagingEvent[];
  changes?: Array<{
    field?: string;
    value?: {
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: MetaMessagingEvent['message'];
    };
  }>;
}

export interface MetaWebhookPayload {
  object?: string;
  entry?: MetaEntry[];
}

function resolveChannelFromObject(objectType: string | undefined): MessagingChannel | null {
  if (objectType === 'page') return 'facebook_messenger';
  if (objectType === 'instagram') return 'instagram_dm';
  return null;
}

function toTimestampSec(ts?: number): number | null {
  if (ts == null || !Number.isFinite(ts)) return null;
  return ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
}

async function processMessagingEvent(
  channel: MessagingChannel,
  pageOrIgId: string,
  event: MetaMessagingEvent
): Promise<void> {
  if (event.message?.is_echo) return;

  const senderId = event.sender?.id;
  if (!senderId) return;

  const text = event.message?.text?.trim() || event.postback?.title || '';
  const messageId = event.message?.mid || `meta_${Date.now()}_${senderId}`;
  const attachments = event.message?.attachments || [];

  const connection =
    channel === 'instagram_dm'
      ? (await findConnectionByIgUserId(pageOrIgId)) ||
        (await findConnectionByPageId(pageOrIgId, 'instagram_dm')) ||
        (await findConnectionByPageId(pageOrIgId, 'facebook_messenger'))
      : (await findConnectionByPageId(pageOrIgId, 'facebook_messenger')) ||
        (await findConnectionByPageId(pageOrIgId));

  if (!connection) {
    console.log(`[Meta] Bağlantı bulunamadı (${channel}, id=${pageOrIgId})`);
    return;
  }

  if (!connection.inbound_enabled || !connection.is_active) {
    console.log(`[Meta] Inbound kapalı → connection=${connection.id}`);
    return;
  }

  // Webhook object wins: Instagram envelope must stay IG even if only a Messenger
  // page connection row was found (otherwise IGSID is sent via Page /messages → #100).
  const effectiveChannel: MessagingChannel =
    channel === 'instagram_dm' || connection.channel === 'instagram_dm'
      ? 'instagram_dm'
      : 'facebook_messenger';

  const customerExternalId = buildCustomerExternalId(effectiveChannel, senderId);

  const imageAttachment = attachments.find(
    (a) => a.type === 'image' && a.payload?.url
  );

  if (imageAttachment?.payload?.url) {
    const media = await downloadMetaAttachment(imageAttachment.payload.url);
    if (media) {
      await dispatchInboundToPipeline({
        channel: effectiveChannel,
        customerExternalId,
        customerDisplayName: null,
        text: text || '',
        messageId,
        timestampSec: toTimestampSec(event.timestamp),
        companyId: connection.company_id,
        connectionId: connection.id,
        media: {
          buffer: media.buffer,
          mimeType: media.mimeType.startsWith('image/') ? media.mimeType : 'image/jpeg',
          caption: text || undefined,
        },
      });
      return;
    }
  }

  if (!text) {
    // Unsupported attachment types — soft handoff via pipeline with placeholder
    if (attachments.length) {
      await dispatchInboundToPipeline({
        channel: effectiveChannel,
        customerExternalId,
        customerDisplayName: null,
        text: '[Medya mesajı]',
        messageId,
        timestampSec: toTimestampSec(event.timestamp),
        companyId: connection.company_id,
        connectionId: connection.id,
      });
    }
    return;
  }

  await dispatchInboundToPipeline({
    channel: effectiveChannel,
    customerExternalId,
    customerDisplayName: null,
    text,
    messageId,
    timestampSec: toTimestampSec(event.timestamp),
    companyId: connection.company_id,
    connectionId: connection.id,
  });
}

export async function processMetaWebhook(payload: MetaWebhookPayload): Promise<void> {
  const channel = resolveChannelFromObject(payload.object);
  if (!channel || !payload.entry?.length) return;

  for (const entry of payload.entry) {
    const entryId = entry.id || '';

    if (entry.messaging?.length) {
      for (const event of entry.messaging) {
        try {
          await processMessagingEvent(channel, entryId, event);
        } catch (err) {
          console.error('[Meta] messaging event error:', err);
        }
      }
    }

    // Instagram sometimes uses entry.changes field "messages"
    if (entry.changes?.length) {
      for (const change of entry.changes) {
        if (change.field !== 'messages' || !change.value) continue;
        const value = change.value;
        const synthetic: MetaMessagingEvent = {
          sender: value.sender,
          recipient: value.recipient,
          timestamp: value.timestamp,
          message: value.message,
        };
        try {
          await processMessagingEvent(channel, entryId, synthetic);
        } catch (err) {
          console.error('[Meta] changes event error:', err);
        }
      }
    }
  }
}

/** Extract page IDs from payload for per-connection app secret resolution */
export function extractMetaPageIds(payload: unknown): string[] {
  const ids = new Set<string>();
  const body = payload as MetaWebhookPayload;
  for (const entry of body.entry || []) {
    if (entry.id) ids.add(entry.id);
  }
  return [...ids];
}
