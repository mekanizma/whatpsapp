/**
 * Resolve Meta connection for outbound replies by channel + company.
 */

import { adminClient } from '../../database/supabase';
import type { ChannelConnectionRow, MessagingChannel } from '../types';

export async function findConnectionForOutbound(
  companyId: string,
  channel: MessagingChannel
): Promise<ChannelConnectionRow | null> {
  const { data } = await adminClient
    .from('channel_connections')
    .select('*')
    .eq('company_id', companyId)
    .eq('channel', channel)
    .eq('status', 'connected')
    .eq('is_active', true)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as ChannelConnectionRow) || null;
}
