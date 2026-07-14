/**
 * Routes outbound replies to the correct MessageChannel by customer external ID.
 * WhatsApp path delegates to existing WhatsApp service — no rewrite of WA send logic.
 */

import {
  sendMessageToCustomer as sendWhatsAppToCustomer,
  sendImageToCustomer as sendWhatsAppImageToCustomer,
} from '../whatsapp/whatsapp.service';
import { isChannelCustomerId, parseCustomerExternalId } from './customer-id';
import { getMetaMessageChannel } from './meta/meta.channel';
import { findConnectionForOutbound } from './meta/meta-connection-resolver';
import type { OutboundSendResult } from './types';

export async function sendChannelText(
  companyId: string,
  customerExternalId: string,
  text: string
): Promise<OutboundSendResult> {
  if (!isChannelCustomerId(customerExternalId)) {
    return sendWhatsAppToCustomer(companyId, customerExternalId, text);
  }

  const { channel, providerUserId } = parseCustomerExternalId(customerExternalId);
  if (channel === 'whatsapp') {
    return sendWhatsAppToCustomer(companyId, providerUserId, text);
  }

  const connection = await findConnectionForOutbound(companyId, channel);
  if (!connection) {
    return { success: false, error: `${channel} bağlantısı bulunamadı veya aktif değil` };
  }

  const adapter = getMetaMessageChannel(channel);
  return adapter.sendText({
    connectionId: connection.id,
    companyId,
    toExternalId: providerUserId,
    text,
  });
}

export async function sendChannelImage(
  companyId: string,
  customerExternalId: string,
  buffer: Buffer,
  mimeType: string,
  caption?: string,
  filename?: string
): Promise<OutboundSendResult> {
  if (!isChannelCustomerId(customerExternalId)) {
    return sendWhatsAppImageToCustomer(
      companyId,
      customerExternalId,
      buffer,
      mimeType,
      caption,
      filename
    );
  }

  const { channel, providerUserId } = parseCustomerExternalId(customerExternalId);
  if (channel === 'whatsapp') {
    return sendWhatsAppImageToCustomer(
      companyId,
      providerUserId,
      buffer,
      mimeType,
      caption,
      filename
    );
  }

  const connection = await findConnectionForOutbound(companyId, channel);
  if (!connection) {
    return { success: false, error: `${channel} bağlantısı bulunamadı veya aktif değil` };
  }

  const adapter = getMetaMessageChannel(channel);
  if (!adapter.sendImage) {
    return { success: false, error: 'Bu kanal görsel göndermeyi desteklemiyor' };
  }

  return adapter.sendImage({
    connectionId: connection.id,
    companyId,
    toExternalId: providerUserId,
    buffer,
    mimeType,
    caption,
    filename,
  });
}
