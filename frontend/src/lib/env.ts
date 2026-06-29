/**
 * Environment validation helpers
 */

const PLACEHOLDER_PATTERNS = ['your-project', 'your-anon-key', 'your-service-role'];

export function isEnvConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  return (
    url.length > 0 &&
    key.length > 0 &&
    !PLACEHOLDER_PATTERNS.some((p) => url.includes(p) || key.includes(p))
  );
}

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';
