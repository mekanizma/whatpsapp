/**
 * Role-based route guard
 */

import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Spinner } from '@/components/ui';
import type { UserRole } from '@/types';

interface RoleRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  redirectTo: string;
}

export function RoleRoute({ children, allowedRoles, redirectTo }: RoleRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  if (!user?.role || !allowedRoles.includes(user.role)) {
    const fallback =
      user?.role === 'super_admin'
        ? '/admin'
        : user?.role === 'staff'
          ? '/panel/messages'
          : '/panel/dashboard';
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
