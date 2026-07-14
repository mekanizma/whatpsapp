/**
 * Dispatch normalized inbound messages into the shared AI pipeline.
 * Uses existing processInboundMessage / processInboundImage without rewriting WhatsApp logic.
 */

import {
  processInboundMessage,
  processInboundImage,
  isRecentInboundMessage,
} from '../../whatsapp/message.handler';
import { adminClient } from '../../database/supabase';
import { getMetaMessageChannel } from './meta.channel';
import type { InboundNormalizedMessage, MessagingChannel } from '../types';
import { parseCustomerExternalId } from '../customer-id';

/** Tag pipeline-inserted rows with Meta channel metadata (shared whatsapp_message_id column). */
async function ensureChannelOnMessage(
  companyId: string,
  customerExternalId: string,
  messageId: string,
  channel: MessagingChannel,
  connectionId: string
): Promise<void> {
  await adminClient
    .from('messages')
    .update({
      channel,
      channel_connection_id: connectionId,
    })
    .eq('company_id', companyId)
    .eq('customer_phone', customerExternalId)
    .eq('whatsapp_message_id', messageId);

  // Also tag recent AI replies for this conversation that lack channel metadata
  await adminClient
    .from('messages')
    .update({
      channel,
      channel_connection_id: connectionId,
    })
    .eq('company_id', companyId)
    .eq('customer_phone', customerExternalId)
    .eq('sender_type', 'ai')
    .eq('channel', 'whatsapp')
    .is('channel_connection_id', null);
}

export async function dispatchInboundToPipeline(
  inbound: InboundNormalizedMessage
): Promise<void> {
  if (!isRecentInboundMessage(inbound.timestampSec)) {
    const ageSec =
      inbound.timestampSec != null
        ? Math.floor(Date.now() / 1000) - inbound.timestampSec
        : -1;
    console.log(
      `[${inbound.channel}] Eski mesaj atlandı (yaş: ${ageSec}s, id: ${inbound.messageId})`
    );
    return;
  }

  let reply = '';

  if (inbound.media) {
    reply = await processInboundImage(
      inbound.companyId,
      inbound.customerExternalId,
      inbound.customerDisplayName,
      {
        buffer: inbound.media.buffer,
        mimeType: inbound.media.mimeType,
        caption: inbound.media.caption || inbound.text || undefined,
      },
      inbound.messageId
    );
  } else {
    reply = await processInboundMessage(
      inbound.companyId,
      inbound.customerExternalId,
      inbound.customerDisplayName,
      inbound.text,
      inbound.messageId
    );
  }

  await ensureChannelOnMessage(
    inbound.companyId,
    inbound.customerExternalId,
    inbound.messageId,
    inbound.channel,
    inbound.connectionId
  );

  if (reply) {
    const { providerUserId } = parseCustomerExternalId(inbound.customerExternalId);
    const adapter = getMetaMessageChannel(inbound.channel);
    const sendResult = await adapter.sendText({
      connectionId: inbound.connectionId,
      companyId: inbound.companyId,
      toExternalId: providerUserId,
      text: reply,
    });
    if (!sendResult.success) {
      console.error(
        `[${inbound.channel}] Yanıt gönderilemedi:`,
        sendResult.error
      );
    }
  }
}
