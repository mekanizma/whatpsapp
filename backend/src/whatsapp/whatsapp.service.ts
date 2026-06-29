/**
 * WhatsApp Cloud API Service
 * Webhook işleme — merkezi message.handler üzerinden (AI optimize)
 */

import { config } from '../config';
import { adminClient } from '../database/supabase';
import { processInboundMessage } from './message.handler';
import { sendBaileysMessage, getBaileysConnectionStatus } from './qr.service';
import { WhatsAppConfig } from '../types';

interface WebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        metadata: { phone_number_id: string };
        contacts?: Array<{ profile: { name: string } }>;
        messages?: Array<{
          from: string;
          id: string;
          type: string;
          text?: { body: string };
        }>;
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
    return response.ok;
  } catch {
    return false;
  }
}

export async function processWebhook(payload: WebhookPayload): Promise<void> {
  if (payload.object !== 'whatsapp_business_account') return;

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const { messages, metadata, contacts } = change.value;
      if (!messages?.length) continue;

      const waConfig = await findWhatsAppConfig(metadata.phone_number_id);
      if (!waConfig) continue;

      for (const msg of messages) {
        if (msg.type !== 'text' || !msg.text?.body) continue;

        const reply = await processInboundMessage(
          waConfig.company_id,
          msg.from,
          contacts?.[0]?.profile?.name || null,
          msg.text.body,
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
      }
    }
  }
}

async function findWhatsAppConfig(phoneNumberId: string): Promise<WhatsAppConfig | null> {
  const { data } = await adminClient
    .from('whatsapp_configs')
    .select('*')
    .eq('business_account_id', phoneNumberId)
    .eq('status', 'connected')
    .single();
  return data as WhatsAppConfig | null;
}

export async function sendTestMessage(
  companyId: string,
  toPhone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const baileysStatus = getBaileysConnectionStatus(companyId);
  if (baileysStatus.connected) {
    return sendBaileysMessage(companyId, toPhone, message);
  }

  const { data: waConfig } = await adminClient
    .from('whatsapp_configs')
    .select('*')
    .eq('company_id', companyId)
    .single();

  if (!waConfig?.access_token || !waConfig?.business_account_id) {
    return { success: false, error: 'WhatsApp bağlantısı yapılandırılmamış' };
  }

  const sent = await sendWhatsAppMessage(
    waConfig.business_account_id,
    waConfig.access_token,
    toPhone,
    message
  );
  return sent ? { success: true } : { success: false, error: 'Mesaj gönderilemedi' };
}

export async function sendMessageToCustomer(
  companyId: string,
  toPhone: string,
  message: string
): Promise<boolean> {
  return (await sendTestMessage(companyId, toPhone, message)).success;
}
