/**
 * WhatsApp Cloud API Service
 */

import { config } from '../config';
import { adminClient } from '../database/supabase';
import { processInboundMessage } from './message.handler';
import {
  sendBaileysMessage,
  getBaileysConnectionStatus,
  disconnectBaileys,
} from './qr.service';
import { WhatsAppAccount } from '../types';
import {
  getDefaultWhatsAppAccount,
  getWhatsAppAccount,
  resolveOutboundAccount,
} from '../services/whatsapp-account.service';

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
      if (!waConfig || waConfig.is_active === false) continue;

      for (const msg of messages) {
        if (msg.type !== 'text' || !msg.text?.body) continue;

        const reply = await processInboundMessage(
          waConfig.company_id,
          msg.from,
          contacts?.[0]?.profile?.name || null,
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
    const sent = await sendWhatsAppMessage(
      account.business_account_id,
      account.access_token,
      toPhone,
      message
    );
    return sent ? { success: true } : { success: false, error: 'Mesaj gönderilemedi' };
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
