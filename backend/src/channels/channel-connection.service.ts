/**
 * channel_connections CRUD — Meta and future non-WhatsApp channels
 */

import { adminClient } from '../database/supabase';
import type { ChannelConnectionRow, MessagingChannel } from './types';

export async function listChannelConnections(
  companyId: string,
  channel?: MessagingChannel
): Promise<ChannelConnectionRow[]> {
  let query = adminClient
    .from('channel_connections')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });

  if (channel) query = query.eq('channel', channel);

  const { data, error } = await query;
  if (error) {
    console.error('[Channels] list failed:', error.message);
    return [];
  }
  return (data || []) as ChannelConnectionRow[];
}

export async function getChannelConnection(
  companyId: string,
  connectionId: string
): Promise<ChannelConnectionRow | null> {
  const { data } = await adminClient
    .from('channel_connections')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', connectionId)
    .maybeSingle();
  return (data as ChannelConnectionRow) || null;
}

export async function findConnectionByPageId(
  pageId: string,
  channel?: MessagingChannel
): Promise<ChannelConnectionRow | null> {
  let query = adminClient
    .from('channel_connections')
    .select('*')
    .eq('external_page_id', pageId)
    .eq('status', 'connected')
    .eq('is_active', true);

  if (channel) query = query.eq('channel', channel);

  const { data } = await query.limit(1).maybeSingle();
  return (data as ChannelConnectionRow) || null;
}

export async function findConnectionByIgUserId(
  igUserId: string
): Promise<ChannelConnectionRow | null> {
  const { data } = await adminClient
    .from('channel_connections')
    .select('*')
    .eq('external_ig_user_id', igUserId)
    .eq('status', 'connected')
    .eq('is_active', true)
    .maybeSingle();
  return (data as ChannelConnectionRow) || null;
}

export async function upsertChannelConnection(
  companyId: string,
  patch: Partial<ChannelConnectionRow> & { channel: MessagingChannel }
): Promise<ChannelConnectionRow | null> {
  const payload = {
    ...patch,
    company_id: companyId,
    updated_at: new Date().toISOString(),
  };

  if (patch.id) {
    const { data, error } = await adminClient
      .from('channel_connections')
      .update(payload)
      .eq('id', patch.id)
      .eq('company_id', companyId)
      .select('*')
      .single();
    if (error) {
      console.error('[Channels] update failed:', error.message);
      return null;
    }
    return data as ChannelConnectionRow;
  }

  const { data, error } = await adminClient
    .from('channel_connections')
    .insert(payload)
    .select('*')
    .single();
  if (error) {
    console.error('[Channels] insert failed:', error.message);
    return null;
  }
  return data as ChannelConnectionRow;
}

export async function updateConnectionFields(
  companyId: string,
  connectionId: string,
  fields: Partial<ChannelConnectionRow>
): Promise<ChannelConnectionRow | null> {
  const { data, error } = await adminClient
    .from('channel_connections')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', connectionId)
    .eq('company_id', companyId)
    .select('*')
    .single();
  if (error) {
    console.error('[Channels] patch failed:', error.message);
    return null;
  }
  return data as ChannelConnectionRow;
}

export async function deleteChannelConnection(
  companyId: string,
  connectionId: string
): Promise<boolean> {
  const { error } = await adminClient
    .from('channel_connections')
    .delete()
    .eq('id', connectionId)
    .eq('company_id', companyId);
  return !error;
}

/** Safe public DTO — never includes access_token / refresh_token */
export function toPublicConnection(row: ChannelConnectionRow) {
  return {
    id: row.id,
    company_id: row.company_id,
    channel: row.channel,
    status: row.status,
    label: row.label,
    external_account_id: row.external_account_id,
    external_page_id: row.external_page_id,
    external_ig_user_id: row.external_ig_user_id,
    account_name: row.account_name,
    page_name: row.page_name,
    webhook_verify_token: row.webhook_verify_token,
    inbound_enabled: row.inbound_enabled,
    is_active: row.is_active,
    metadata: row.metadata,
    last_error: row.last_error,
    connected_at: row.connected_at,
    last_synced_at: row.last_synced_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    has_token: Boolean(row.access_token),
  };
}
