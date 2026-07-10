/**
 * Supabase client for frontend authentication
 */

import { createClient } from '@supabase/supabase-js';
import { isEnvConfigured, isDemoMode } from '@/lib/env';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'demo-key';

export const supabaseConfigured = isEnvConfigured() && !isDemoMode;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Realtime postgres_changes RLS için JWT senkronu */
export async function syncSupabaseRealtimeAuth(): Promise<void> {
  if (!supabaseConfigured) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  await supabase.realtime.setAuth(session?.access_token ?? '');
}

if (supabaseConfigured) {
  void syncSupabaseRealtimeAuth();
  supabase.auth.onAuthStateChange((_event, session) => {
    void supabase.realtime.setAuth(session?.access_token ?? '');
  });
}
