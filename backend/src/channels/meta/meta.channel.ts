/**
 * Meta MessageChannel adapters (Facebook Messenger + Instagram DM)
 */

import {
  getChannelConnection,
} from '../channel-connection.service';
import { sendMessengerText, sendMessengerImageUrl } from './meta-graph.service';
import type { MessageChannel, MessagingChannel, OutboundSendResult } from '../types';
import { config } from '../../config';

async function resolvePageCredentials(connectionId: string, companyId: string) {
  const conn = await getChannelConnection(companyId, connectionId);
  if (!conn || conn.status !== 'connected' || !conn.is_active) {
    return { error: 'Kanal bağlantısı aktif değil' as const };
  }
  if (!conn.access_token || !conn.external_page_id) {
    return { error: 'Sayfa erişim jetonu veya page id eksik' as const };
  }
  return {
    pageId: conn.external_page_id,
    token: conn.access_token,
  };
}

function createMetaChannel(channel: MessagingChannel): MessageChannel {
  return {
    channel,

    async sendText({ connectionId, companyId, toExternalId, text }): Promise<OutboundSendResult> {
      const creds = await resolvePageCredentials(connectionId, companyId);
      if ('error' in creds) return { success: false, error: creds.error };
      return sendMessengerText(creds.pageId, creds.token, toExternalId, text);
    },

    async sendImage({
      connectionId,
      companyId,
      toExternalId,
      buffer,
      mimeType,
      caption,
      filename,
    }): Promise<OutboundSendResult> {
      const creds = await resolvePageCredentials(connectionId, companyId);
      if ('error' in creds) return { success: false, error: creds.error };

      // Messenger requires a public URL for attachments — upload to temp storage if publicUrl set.
      // Fallback: send caption text only when URL hosting unavailable.
      const publicBase = config.publicUrl;
      if (!publicBase) {
        if (caption?.trim()) {
          await sendMessengerText(creds.pageId, creds.token, toExternalId, caption.trim());
        }
        return {
          success: false,
          error: 'Meta görsel gönderimi için APP_URL / publicUrl gerekli',
        };
      }

      // Data-URI style upload is not supported by Messenger; use Graph attachment upload
      try {
        const form = new FormData();
        form.append('message', JSON.stringify({
          attachment: {
            type: 'image',
            payload: { is_reusable: true },
          },
        }));
        form.append(
          'filedata',
          new Blob([buffer], { type: mimeType }),
          filename || 'image.jpg'
        );

        const uploadRes = await fetch(
          `${config.meta.baseUrl}/me/message_attachments?access_token=${encodeURIComponent(creds.token)}`,
          { method: 'POST', body: form }
        );
        if (!uploadRes.ok) {
          const errBody = await uploadRes.text().catch(() => '');
          return { success: false, error: errBody || 'Görsel yüklenemedi' };
        }
        const uploaded = (await uploadRes.json()) as { attachment_id?: string };
        if (!uploaded.attachment_id) {
          return { success: false, error: 'attachment_id alınamadı' };
        }

        if (caption?.trim()) {
          await sendMessengerText(creds.pageId, creds.token, toExternalId, caption.trim());
        }

        const res = await fetch(`${config.meta.baseUrl}/${creds.pageId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${creds.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient: { id: toExternalId },
            messaging_type: 'RESPONSE',
            message: {
              attachment: {
                type: 'image',
                payload: { attachment_id: uploaded.attachment_id },
              },
            },
          }),
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          return { success: false, error: errBody || 'Görsel gönderilemedi' };
        }
        return { success: true };
      } catch (err) {
        // Last resort: try URL helper if somehow we have a public URL (unused buffer path)
        void sendMessengerImageUrl;
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Görsel gönderilemedi',
        };
      }
    },
  };
}

const messengerChannel = createMetaChannel('facebook_messenger');
const instagramChannel = createMetaChannel('instagram_dm');

export function getMetaMessageChannel(channel: MessagingChannel): MessageChannel {
  if (channel === 'instagram_dm') return instagramChannel;
  return messengerChannel;
}
