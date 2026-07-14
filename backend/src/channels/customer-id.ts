/**
 * Conversation identity helpers — channel-agnostic customer keys.
 * WhatsApp keeps raw E.164 digits. Meta uses prefixed IDs so phone normalization never corrupts PSIDs.
 */

import type { MessagingChannel } from './types';

const CHANNEL_PREFIX: Record<Exclude<MessagingChannel, 'whatsapp'>, string> = {
  facebook_messenger: 'fb',
  instagram_dm: 'ig',
};

const PREFIX_TO_CHANNEL: Record<string, MessagingChannel> = {
  fb: 'facebook_messenger',
  ig: 'instagram_dm',
};

/** Prefixed Meta / future-channel conversation IDs (e.g. fb:123, ig:456) */
export function isChannelCustomerId(value: string): boolean {
  return /^(fb|ig|tg|web):/i.test(value.trim());
}

export function buildCustomerExternalId(
  channel: MessagingChannel,
  providerUserId: string
): string {
  const id = providerUserId.trim();
  if (channel === 'whatsapp') return id;
  const prefix = CHANNEL_PREFIX[channel];
  if (id.toLowerCase().startsWith(`${prefix}:`)) return id;
  return `${prefix}:${id}`;
}

export function parseCustomerExternalId(value: string): {
  channel: MessagingChannel;
  providerUserId: string;
} {
  const trimmed = value.trim();
  const match = /^(fb|ig|tg|web):(.+)$/i.exec(trimmed);
  if (!match) {
    return { channel: 'whatsapp', providerUserId: trimmed };
  }
  const prefix = match[1].toLowerCase();
  const channel = PREFIX_TO_CHANNEL[prefix] || 'whatsapp';
  return { channel, providerUserId: match[2] };
}

export function channelLabel(channel: MessagingChannel): string {
  switch (channel) {
    case 'facebook_messenger':
      return 'Facebook Messenger';
    case 'instagram_dm':
      return 'Instagram DM';
    case 'whatsapp':
    default:
      return 'WhatsApp';
  }
}
