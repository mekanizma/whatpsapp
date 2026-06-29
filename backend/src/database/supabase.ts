/**
 * Supabase client instances
 * - adminClient: service role (bypasses RLS) for backend operations
 * - createUserClient: per-request client with user JWT for RLS
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

export const adminClient: SupabaseClient = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
