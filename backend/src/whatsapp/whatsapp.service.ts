/**
 * WhatsApp Cloud API Service
 */

import { config } from '../config';
import { adminClient } from '../database/supabase';
import { processInboundMessage, processInboundImage, processInboundVoiceMessage } from './message.handler';
import {
  sendBaileysMessage,
  sendBaileysImage,
  getBaileysConnectionStatus,
  disconnectBaileys,
} from './qr.service';
import { WhatsAppAccount } from '../types';
import {
  getDefaultWhatsAppAccount,
  getWhatsAppAccount,
  resolveOutboundAccount,
} from '../services/whatsapp-account.service';

interface WebhookImageMessage {
  from: string;
  id: string;
  type: 'image';
  image?: {
    id?: string;
    mime_type?: string;
    caption?: string;
    sha256?: string;
  };
}

interface WebhookTextMessage {
  from: string;
  id: string;
  type: 'text';
  text?: { body: string };
}

interface WebhookAudioMessage {
  from: string;
  id: string;
  type: 'audio';
  audio?: {
    id?: string;
    mime_type?: string;
  };
}

type WebhookMessage = WebhookTextMessage | WebhookImageMessage | WebhookAudioMessage;

interface WebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        metadata: { phone_number_id: string };
        contacts?: Array<{ profile: { name: string } }>;
        messages?: WebhookMessage[];
      };
      field: string;
    }>;
  }>;
}

export async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  message: string
): Promise<boolean> {
  const result = await sendWhatsAppTextMessage(phoneNumberId, accessToken, to, message);
  return result.success;
}

async function sendWhatsAppTextMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${config.whatsapp.baseUrl}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        }),
      }
    );
    if (response.ok) return { success: true };
    const errBody = await response.text().catch(() => '');
    return { success: false, error: errBody || 'Mesaj gönderilemedi' };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Mesaj gönderilemedi',
    };
  }
}

export function sanitizeWhatsAppTemplateParam(value: string, maxLen = 900): string {
  const cleaned = value.replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, maxLen) || '-';
}

export interface StaffTicketTemplateParams {
  customerLabel: string;
  subject: string;
  departmentName: string;
}

export async function sendWhatsAppTemplate(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${config.whatsapp.baseUrl}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            components: [
              {
                type: 'body',
                parameters: bodyParameters.map((text) => ({
                  type: 'text',
                  text: sanitizeWhatsAppTemplateParam(text),
                })),
              },
            ],
          },
        }),
      }
    );
    if (response.ok) return { success: true };
    const errBody = await response.text().catch(() => '');
    return { success: false, error: errBody || 'Şablon gönderilemedi' };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Şablon gönderilemedi',
    };
  }
}

async function uploadWhatsAppMedia(
  phoneNumberId: string,
  accessToken: string,
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<string | null> {
  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([buffer], { type: mimeType }), filename);

    const response = await fetch(`${config.whatsapp.baseUrl}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });

    if (!response.ok) return null;
    const data = (await response.json()) as { id?: string };
    return data.id || null;
  } catch {
    return null;
  }
}

export async function sendWhatsAppImage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  buffer: Buffer,
  mimeType: string,
  caption?: string,
  filename = 'image.jpg'
): Promise<boolean> {
  try {
    const mediaId = await uploadWhatsAppMedia(phoneNumberId, accessToken, buffer, mimeType, filename);
    if (!mediaId) return false;

    const imagePayload: Record<string, unknown> = { id: mediaId };
    if (caption?.trim()) {
      imagePayload.caption = caption.trim();
    }

    const response = await fetch(
      `${config.whatsapp.baseUrl}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'image',
          image: imagePayload,
        }),
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function downloadCloudApiMedia(
  mediaId: string,
  accessToken: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const metaRes = await fetch(`${config.whatsapp.baseUrl}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) return null;

    const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
    if (!meta.url) return null;

    const fileRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!fileRes.ok) return null;

    const buffer = Buffer.from(await fileRes.arrayBuffer());
    return { buffer, mimeType: meta.mime_type || fileRes.headers.get('content-type') || 'image/jpeg' };
  } catch {
    return null;
  }
}

export async function processWebhook(payload: WebhookPayload): Promise<void> {
  if (payload.object !== 'whatsapp_business_account') return;

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const { messages, metadata, contacts } = change.value;
      if (!messages?.length) continue;

      const waConfig = await findWhatsAppConfig(metadata.phone_number_id);
      if (!waConfig || waConfig.is_active === false) continue;

      for (const msg of messages) {
        const customerName = contacts?.[0]?.profile?.name || null;

        if (msg.type === 'image' && msg.image?.id && waConfig.access_token) {
          const media = await downloadCloudApiMedia(msg.image.id, waConfig.access_token);
          if (!media) continue;

          const reply = await processInboundImage(
            waConfig.company_id,
            msg.from,
            customerName,
            {
              buffer: media.buffer,
              mimeType: msg.image.mime_type || media.mimeType,
              caption: msg.image.caption,
            },
            msg.id,
            waConfig.id
          );

          if (reply) {
            await sendWhatsAppMessage(
              metadata.phone_number_id,
              waConfig.access_token,
              msg.from,
              reply
            );
          }
          continue;
        }

        if (msg.type === 'audio') {
          const reply = await processInboundVoiceMessage(
            waConfig.company_id,
            msg.from,
            msg.id
          );

          if (reply && waConfig.access_token) {
            await sendWhatsAppMessage(
              metadata.phone_number_id,
              waConfig.access_token,
              msg.from,
              reply
            );
          }
          continue;
        }

        if (msg.type !== 'text' || !msg.text?.body) continue;

        const reply = await processInboundMessage(
          waConfig.company_id,
          msg.from,
          customerName,
          msg.text.body,
          msg.id,
          waConfig.id
        );

        if (reply && waConfig.access_token) {
          await sendWhatsAppMessage(
            metadata.phone_number_id,
            waConfig.access_token,
            msg.from,
            reply
          );
        }
      }
    }
  }
}

async function findWhatsAppConfig(phoneNumberId: string): Promise<WhatsAppAccount | null> {
  const { data } = await adminClient
    .from('whatsapp_configs')
    .select('*')
    .eq('business_account_id', phoneNumberId)
    .eq('status', 'connected')
    .single();
  return data as WhatsAppAccount | null;
}

async function sendViaAccount(
  account: WhatsAppAccount,
  toPhone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  if (!account.is_active) {
    return { success: false, error: 'Bu WhatsApp hattı pasif durumda' };
  }

  if (account.business_account_id?.startsWith('baileys:')) {
    const baileysStatus = await getBaileysConnectionStatus(account.id);
    if (baileysStatus.connected) {
      return sendBaileysMessage(account.id, account.company_id, toPhone, message);
    }
    return { success: false, error: 'WhatsApp bağlantısı aktif değil. QR ile yeniden bağlanın.' };
  }

  if (account.access_token && account.business_account_id) {
    return sendWhatsAppTextMessage(
      account.business_account_id,
      account.access_token,
      toPhone,
      message
    );
  }

  return { success: false, error: 'WhatsApp bağlantısı yapılandırılmamış' };
}

async function sendImageViaAccount(
  account: WhatsAppAccount,
  toPhone: string,
  buffer: Buffer,
  mimeType: string,
  caption?: string,
  filename?: string
): Promise<{ success: boolean; error?: string }> {
  if (!account.is_active) {
    return { success: false, error: 'Bu WhatsApp hattı pasif durumda' };
  }

  if (account.business_account_id?.startsWith('baileys:')) {
    const baileysStatus = await getBaileysConnectionStatus(account.id);
    if (baileysStatus.connected) {
      return sendBaileysImage(account.id, account.company_id, toPhone, buffer, mimeType, caption);
    }
    return { success: false, error: 'WhatsApp bağlantısı aktif değil. QR ile yeniden bağlanın.' };
  }

  if (account.access_token && account.business_account_id) {
    const sent = await sendWhatsAppImage(
      account.business_account_id,
      account.access_token,
      toPhone,
      buffer,
      mimeType,
      caption,
      filename
    );
    return sent ? { success: true } : { success: false, error: 'Resim gönderilemedi' };
  }

  return { success: false, error: 'WhatsApp bağlantısı yapılandırılmamış' };
}

export async function sendTestMessage(
  companyId: string,
  toPhone: string,
  message: string,
  accountId?: string
): Promise<{ success: boolean; error?: string }> {
  const account = accountId
    ? await getWhatsAppAccount(companyId, accountId)
    : await getDefaultWhatsAppAccount(companyId);

  if (!account) {
    return { success: false, error: 'WhatsApp hesabı bulunamadı' };
  }

  return sendViaAccount(account, toPhone, message);
}

export async function sendMessageToCustomer(
  companyId: string,
  toPhone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const account = await resolveOutboundAccount(companyId, toPhone);
  if (!account) {
    return { success: false, error: 'Aktif WhatsApp hattı bulunamadı' };
  }
  return sendViaAccount(account, toPhone, message);
}

async function sendStaffTicketViaAccount(
  account: WhatsAppAccount,
  toPhone: string,
  params: StaffTicketTemplateParams,
  plainTextFallback: string
): Promise<{ success: boolean; error?: string }> {
  if (!account.is_active) {
    return { success: false, error: 'Bu WhatsApp hattı pasif durumda' };
  }

  if (account.business_account_id?.startsWith('baileys:')) {
    const baileysStatus = await getBaileysConnectionStatus(account.id);
    if (baileysStatus.connected) {
      return sendBaileysMessage(account.id, account.company_id, toPhone, plainTextFallback);
    }
    return { success: false, error: 'WhatsApp bağlantısı aktif değil. QR ile yeniden bağlanın.' };
  }

  if (account.access_token && account.business_account_id) {
    return sendWhatsAppTemplate(
      account.business_account_id,
      account.access_token,
      toPhone,
      config.whatsapp.staffTicketTemplateName,
      config.whatsapp.staffTicketTemplateLang,
      [params.customerLabel, params.subject, params.departmentName]
    );
  }

  return { success: false, error: 'WhatsApp bağlantısı yapılandırılmamış' };
}

/** Personel talep bildirimi — Meta Cloud API'de utility şablon, Baileys'te düz metin */
export async function sendStaffTicketNotification(
  companyId: string,
  toPhone: string,
  params: StaffTicketTemplateParams,
  plainTextFallback: string
): Promise<{ success: boolean; error?: string }> {
  const account = await resolveOutboundAccount(companyId, toPhone);
  if (!account) {
    return { success: false, error: 'Aktif WhatsApp hattı bulunamadı' };
  }
  return sendStaffTicketViaAccount(account, toPhone, params, plainTextFallback);
}

export async function sendImageToCustomer(
  companyId: string,
  toPhone: string,
  buffer: Buffer,
  mimeType: string,
  caption?: string,
  filename?: string
): Promise<{ success: boolean; error?: string }> {
  const account = await resolveOutboundAccount(companyId, toPhone);
  if (!account) {
    return { success: false, error: 'Aktif WhatsApp hattı bulunamadı' };
  }
  return sendImageViaAccount(account, toPhone, buffer, mimeType, caption, filename);
}

export async function disconnectAccount(
  accountId: string,
  companyId: string
): Promise<void> {
  const account = await getWhatsAppAccount(companyId, accountId);
  if (!account) return;

  if (!config.isVercel && account.business_account_id?.startsWith('baileys:')) {
    await disconnectBaileys(accountId, companyId);
  } else if (!config.demoMode) {
    await adminClient
      .from('whatsapp_configs')
      .update({
        status: 'disconnected',
        access_token: null,
        phone_number: null,
        business_account_id: null,
        profile_name: null,
      })
      .eq('id', accountId);
  }
}

export { findWhatsAppConfig };
