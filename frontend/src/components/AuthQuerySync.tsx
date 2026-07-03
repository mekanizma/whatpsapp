/**
 * Clears React Query cache when the authenticated user changes (login / logout / switch).
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';

export function AuthQuerySync() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const prevUserId = useRef<string | undefined>(undefined);
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      prevUserId.current = userId;
      return;
    }

    if (prevUserId.current !== userId) {
      queryClient.clear();
      prevUserId.current = userId;
    }
  }, [userId, queryClient]);

  return null;
}
