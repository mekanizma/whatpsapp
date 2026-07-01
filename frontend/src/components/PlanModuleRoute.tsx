/**
 * Paket modülüne göre rota koruması
 */

import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { planHasModule, type PlanModuleKey } from '@/lib/plan-capabilities';

interface PlanModuleRouteProps {
  module: PlanModuleKey;
  children: React.ReactNode;
  redirectTo?: string;
}

export function PlanModuleRoute({
  module,
  children,
  redirectTo = '/panel/messages',
}: PlanModuleRouteProps) {
  const companyPlan = useAuthStore((s) => s.companyPlan);
  const company = useAuthStore((s) => s.company);
  const planType = companyPlan?.plan_type || company?.subscription_plan;

  if (!planHasModule(planType, module)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
