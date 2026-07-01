/**
 * Role-only route guard (for nested panel routes)
 */

import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { planHasModule } from '@/lib/plan-capabilities';

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
  const company = useAuthStore((s) => s.company);
  const companyPlan = useAuthStore((s) => s.companyPlan);
  const planType = companyPlan?.plan_type || company?.subscription_plan;

  if (user?.role === 'staff') {
    return <Navigate to="/panel/messages" replace />;
  }

  if (planHasModule(planType, 'dashboard')) {
    return <Navigate to="/panel/dashboard" replace />;
  }

  return <Navigate to="/panel/messages" replace />;
}
