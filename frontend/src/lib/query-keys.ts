/**
 * Auth-scoped React Query keys — prevents cross-user / cross-role cache bleed.
 */

import type { UserRole } from '@/types';

export function authQueryKey(
  base: readonly string[],
  userId?: string | null,
  role?: UserRole | null
): readonly string[] {
  return [...base, userId ?? 'anon', role ?? 'none'];
}
