/**
 * Supabase client for frontend authentication
 */

import { createClient } from '@supabase/supabase-js';
import { isEnvConfigured, isDemoMode } from '@/lib/env';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'demo-key';

export const supabaseConfigured = isEnvConfigured() && !isDemoMode;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
