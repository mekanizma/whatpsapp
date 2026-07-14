/**
 * Channel-agnostic messaging types.
 * WhatsApp, Facebook Messenger, Instagram DM (and future Telegram / Web Chat)
 * all normalize to InboundNormalizedMessage and send via MessageChannel.
 */

export type MessagingChannel =
  | 'whatsapp'
  | 'facebook_messenger'
  | 'instagram_dm';

export type ChannelConnectionStatus =
  | 'disconnected'
  | 'pending'
  | 'connected'
  | 'error';

export interface InboundNormalizedMessage {
  channel: MessagingChannel;
  /** Stable conversation key stored in messages.customer_phone */
  customerExternalId: string;
  customerDisplayName: string | null;
  text: string;
  messageId: string;
  timestampSec: number | null;
  companyId: string;
  connectionId: string;
  media?: {
    buffer: Buffer;
    mimeType: string;
    caption?: string;
  };
}

export interface OutboundSendResult {
  success: boolean;
  error?: string;
  providerMessageId?: string;
}

export interface MessageChannel {
  readonly channel: MessagingChannel;

  sendText(params: {
    connectionId: string;
    companyId: string;
    toExternalId: string;
    text: string;
  }): Promise<OutboundSendResult>;

  sendImage?(params: {
    connectionId: string;
    companyId: string;
    toExternalId: string;
    buffer: Buffer;
    mimeType: string;
    caption?: string;
    filename?: string;
  }): Promise<OutboundSendResult>;
}

export interface ChannelConnectionRow {
  id: string;
  company_id: string;
  channel: MessagingChannel;
  status: ChannelConnectionStatus;
  label: string | null;
  external_account_id: string | null;
  external_page_id: string | null;
  external_ig_user_id: string | null;
  account_name: string | null;
  page_name: string | null;
  access_token: string | null;
  token_expires_at: string | null;
  refresh_token: string | null;
  webhook_verify_token: string | null;
  inbound_enabled: boolean;
  is_active: boolean;
  metadata: Record<string, unknown>;
  last_error: string | null;
  connected_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}
