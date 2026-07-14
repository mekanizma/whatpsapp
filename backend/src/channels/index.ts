/**
 * Channel registry — future Telegram / Web Chat adapters register here.
 */

import type { MessageChannel, MessagingChannel } from './types';
import { getMetaMessageChannel } from './meta/meta.channel';

const registry = new Map<MessagingChannel, MessageChannel>();

export function registerChannel(adapter: MessageChannel): void {
  registry.set(adapter.channel, adapter);
}

export function getChannel(channel: MessagingChannel): MessageChannel | null {
  if (channel === 'facebook_messenger' || channel === 'instagram_dm') {
    return getMetaMessageChannel(channel);
  }
  return registry.get(channel) || null;
}

registerChannel(getMetaMessageChannel('facebook_messenger'));
registerChannel(getMetaMessageChannel('instagram_dm'));

export type { MessageChannel, MessagingChannel, InboundNormalizedMessage } from './types';
export { buildCustomerExternalId, parseCustomerExternalId, isChannelCustomerId } from './customer-id';
export { sendChannelText, sendChannelImage } from './outbound.service';
