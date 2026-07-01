/**
 * Role-only route guard (for nested panel routes)
 */

import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

interface AdminOnlyRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export function AdminOnlyRoute({ children, redirectTo = '/panel/messages' }: AdminOnlyRouteProps) {
  const user = useAuthStore((s) => s.user);

  if (user?.role === 'staff') {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

export function PanelIndexRedirect() {
  const user = useAuthStore((s) => s.user);

  if (user?.role === 'staff') {
    return <Navigate to="/panel/messages" replace />;
  }

  return <Navigate to="/panel/dashboard" replace />;
}
