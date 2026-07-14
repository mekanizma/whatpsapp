/**
 * Meta MessageChannel adapters (Facebook Messenger + Instagram DM)
 */

import {
  getChannelConnection,
} from '../channel-connection.service';
import {
  sanitizeMetaRecipientId,
  sendMessengerText,
  sendMessengerImageUrl,
} from './meta-graph.service';
import type { MessageChannel, MessagingChannel, OutboundSendResult } from '../types';
import { config } from '../../config';

async function resolveSendCredentials(
  connectionId: string,
  companyId: string,
  channel: MessagingChannel
) {
  const conn = await getChannelConnection(companyId, connectionId);
  if (!conn || conn.status !== 'connected' || !conn.is_active) {
    return { error: 'Kanal bağlantısı aktif değil' as const };
  }
  if (!conn.access_token) {
    return { error: 'Sayfa erişim jetonu eksik' as const };
  }

  // Facebook Login + Page token: hem Messenger hem Instagram DM
  // POST /{page-id}/messages ile gider. Instagram Login user token yolu
  // POST /{ig-user-id}/messages ister; page token ile #3 (capability) döner.
  const graphActorId = conn.external_page_id || (
    channel === 'instagram_dm' ? conn.external_ig_user_id : null
  );

  if (!graphActorId) {
    return {
      error:
        channel === 'instagram_dm'
          ? 'Facebook Page id eksik — Instagram DM gönderimi için sayfayı yeniden bağlayın'
          : 'Facebook Page id eksik',
    } as const;
  }

  if (channel === 'instagram_dm' && !conn.external_page_id && conn.external_ig_user_id) {
    console.warn(
      `[Meta] Page id yok; IG user id ile denenecek (Instagram Login) → ${connectionId}`
    );
  }

  return {
    graphActorId,
    token: conn.access_token,
  };
}

function createMetaChannel(channel: MessagingChannel): MessageChannel {
  return {
    channel,

    async sendText({ connectionId, companyId, toExternalId, text }): Promise<OutboundSendResult> {
      const recipientId = sanitizeMetaRecipientId(toExternalId);
      if (!recipientId) {
        return {
          success: false,
          error:
            'Geçersiz alıcı id — webhook’tan gelen PSID/IGSID kullanılmalı (ör. 1234567890)',
        };
      }
      const creds = await resolveSendCredentials(connectionId, companyId, channel);
      if ('error' in creds) return { success: false, error: creds.error };
      return sendMessengerText(creds.graphActorId, creds.token, recipientId, text);
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
      const recipientId = sanitizeMetaRecipientId(toExternalId);
      if (!recipientId) {
        return {
          success: false,
          error:
            'Geçersiz alıcı id — webhook’tan gelen PSID/IGSID kullanılmalı (ör. 1234567890)',
        };
      }
      const creds = await resolveSendCredentials(connectionId, companyId, channel);
      if ('error' in creds) return { success: false, error: creds.error };

      // Messenger requires a public URL for attachments — upload to temp storage if publicUrl set.
      // Fallback: send caption text only when URL hosting unavailable.
      const publicBase = config.publicUrl;
      if (!publicBase) {
        if (caption?.trim()) {
          await sendMessengerText(creds.graphActorId, creds.token, recipientId, caption.trim());
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
          await sendMessengerText(creds.graphActorId, creds.token, recipientId, caption.trim());
        }

        const res = await fetch(`${config.meta.baseUrl}/${creds.graphActorId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${creds.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient: { id: recipientId },
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
