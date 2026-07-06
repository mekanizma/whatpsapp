/**
 * Müşteri paneli route guard — super admin yalnızca impersonation ile girebilir
 */

import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Spinner } from '@/components/ui';
import type { UserRole } from '@/types';

interface PanelRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export function PanelRoute({ children, redirectTo = '/login' }: PanelRouteProps) {
  const { user, isLoading, isAuthenticated, isImpersonating } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to={redirectTo} replace />;
  }

  if (user.role === 'super_admin' && !isImpersonating) {
    return <Navigate to="/admin" replace />;
  }

  const allowedRoles: UserRole[] = ['company_admin', 'staff', 'super_admin'];
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
