/**
 * Supabase client instances
 * - adminClient: service role (bypasses RLS) for backend operations
 * - createUserClient: per-request client with user JWT for RLS
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';
import { config } from '../config';

/** Node.js 20'de native WebSocket yok; @supabase/realtime-js ws paketi ister */
const baseClientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    // ws ve @supabase/realtime-js tipleri uyumsuz; runtime'da doğru çalışır
    transport: WebSocket as never,
  },
};

export const adminClient: SupabaseClient = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  baseClientOptions
);

export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(config.supabase.url, config.supabase.anonKey, {
    ...baseClientOptions,
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
