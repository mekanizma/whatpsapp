/**
 * Müşteri (şirket) ve personel panel layout
 */

import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, MessageSquare, BookOpen, Users, Ticket,
  CreditCard, Smartphone, Settings, CalendarDays, UserRound, HelpCircle, Headphones,
  Sparkles, UserCog, PackageSearch, Truck, ShoppingCart, RefreshCcw, Globe,
} from 'lucide-react';
import { PanelNotificationBell } from '@/components/PanelNotificationBell';
import { useAuthStore } from '@/store/authStore';
import { planHasModule, type PlanModuleKey } from '@/lib/plan-capabilities';
import { canSeeNavItem } from '@/lib/staff-permissions';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CompanyLogo } from '@/components/CompanyLogo';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { PremiumPanelFrame, PremiumSidebar, type PremiumNavGroup } from '@/components/layout/PremiumSidebar';
import type { UserRole } from '@/types';

type NavItem = {
  to: string;
  icon: typeof LayoutDashboard;
  labelKey: string;
  roles: UserRole[];
  module: PlanModuleKey;
  staffNav?: 'messages' | 'knowledge' | 'tickets' | 'settings' | 'calendar';
};

const navGroups: { sectionKey: string; items: NavItem[] }[] = [
  {
    sectionKey: 'layout.navSections.overview',
    items: [
      { to: '/panel/dashboard', icon: LayoutDashboard, labelKey: 'layout.nav.dashboard', roles: ['company_admin'], module: 'dashboard' },
    ],
  },
  {
    sectionKey: 'layout.navSections.communication',
    items: [
      { to: '/panel/messages', icon: MessageSquare, labelKey: 'layout.nav.messages', roles: ['company_admin', 'staff'], module: 'messages', staffNav: 'messages' },
      { to: '/panel/tickets', icon: Ticket, labelKey: 'layout.nav.tickets', roles: ['company_admin', 'staff'], module: 'tickets', staffNav: 'tickets' },
      { to: '/panel/customers', icon: UserRound, labelKey: 'layout.nav.customers', roles: ['company_admin'], module: 'customers' },
      { to: '/panel/website', icon: Globe, labelKey: 'layout.nav.website', roles: ['company_admin'], module: 'website' },
    ],
  },
  {
    sectionKey: 'layout.navSections.operations',
    items: [
      { to: '/panel/knowledge', icon: BookOpen, labelKey: 'layout.nav.knowledge', roles: ['company_admin', 'staff'], module: 'knowledge', staffNav: 'knowledge' },
      { to: '/panel/unknown-questions', icon: HelpCircle, labelKey: 'layout.nav.unknownQuestions', roles: ['company_admin'], module: 'unknown_questions' },
      { to: '/panel/calendar', icon: CalendarDays, labelKey: 'layout.nav.calendar', roles: ['company_admin', 'staff'], module: 'calendar', staffNav: 'calendar' },
      { to: '/panel/order-status', icon: PackageSearch, labelKey: 'layout.nav.orderStatus', roles: ['company_admin'], module: 'order_status' },
      { to: '/panel/shipping-tracking', icon: Truck, labelKey: 'layout.nav.shippingTracking', roles: ['company_admin'], module: 'shipping_tracking' },
      { to: '/panel/cart', icon: ShoppingCart, labelKey: 'layout.nav.cart', roles: ['company_admin'], module: 'cart' },
      { to: '/panel/returns', icon: RefreshCcw, labelKey: 'layout.nav.returns', roles: ['company_admin'], module: 'returns' },
    ],
  },
  {
    sectionKey: 'layout.navSections.management',
    items: [
      { to: '/panel/staff', icon: Users, labelKey: 'layout.nav.staff', roles: ['company_admin'], module: 'staff' },
      { to: '/panel/whatsapp', icon: Smartphone, labelKey: 'layout.nav.whatsapp', roles: ['company_admin'], module: 'whatsapp' },
      { to: '/panel/subscription', icon: CreditCard, labelKey: 'layout.nav.subscription', roles: ['company_admin'], module: 'subscription' },
      { to: '/panel/platform-support', icon: Headphones, labelKey: 'layout.nav.platformSupport', roles: ['company_admin'], module: 'settings' },
    ],
  },
  {
    sectionKey: 'layout.navSections.account',
    items: [
      { to: '/panel/settings', icon: Settings, labelKey: 'layout.nav.settings', roles: ['company_admin', 'staff'], module: 'settings', staffNav: 'settings' },
    ],
  },
];

const pageTitleKeys: Record<string, string> = {
  '/panel/dashboard': 'layout.titles.dashboard',
  '/panel/messages': 'layout.titles.messages',
  '/panel/activity/today': 'layout.titles.todayActivity',
  '/panel/ai-insights': 'layout.titles.aiInsights',
  '/panel/customers': 'layout.titles.customers',
  '/panel/website': 'layout.titles.website',
  '/panel/knowledge': 'layout.titles.knowledge',
  '/panel/unknown-questions': 'layout.titles.unknownQuestions',
  '/panel/tickets': 'layout.titles.tickets',
  '/panel/calendar': 'layout.titles.calendar',
  '/panel/order-status': 'layout.titles.orderStatus',
  '/panel/shipping-tracking': 'layout.titles.shippingTracking',
  '/panel/cart': 'layout.titles.cart',
  '/panel/returns': 'layout.titles.returns',
  '/panel/staff': 'layout.titles.staff',
  '/panel/whatsapp': 'layout.titles.whatsapp',
  '/panel/subscription': 'layout.titles.subscription',
  '/panel/platform-support': 'layout.titles.platformSupport',
  '/panel/settings': 'layout.titles.settings',
};

function getEffectivePanelRole(
  user: ReturnType<typeof useAuthStore.getState>['user'],
  isImpersonating: boolean
): UserRole | null {
  if (!user) return null;
  if (user.role === 'super_admin' && isImpersonating) return 'company_admin';
  return user.role;
}

function filterNavItem(
  item: NavItem,
  user: ReturnType<typeof useAuthStore.getState>['user'],
  planType: string | undefined,
  isImpersonating: boolean
) {
  const role = getEffectivePanelRole(user, isImpersonating);
  if (!role || !item.roles.includes(role)) return false;
  if (role === 'super_admin' && !isImpersonating) return false;
  if (!planHasModule(planType, item.module)) return false;
  if (user?.role === 'staff' && item.staffNav) {
    return canSeeNavItem(user.role, user.staff_role, item.staffNav);
  }
  return true;
}

export function CompanyLayout() {
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, company, companyPlan, logout, isImpersonating } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const planType = companyPlan?.plan_type || company?.subscription_plan;
  const isStaff = user?.role === 'staff';

  const visibleGroups: PremiumNavGroup[] = navGroups
    .map((group) => ({
      sectionLabel: t(group.sectionKey),
      items: group.items
        .filter((item) => filterNavItem(item, user, planType, isImpersonating))
        .map((item) => ({
          to: item.to,
          icon: item.icon,
          label: t(item.labelKey),
        })),
    }))
    .filter((group) => group.items.length > 0);

  const pageTitle = t(pageTitleKeys[location.pathname] || 'layout.panel');

  const roleLabel = isImpersonating
    ? t('admin.impersonation.viewingAsAdmin')
    : user?.role === 'staff' && user.staff_role
      ? t(`staff.roles.${user.staff_role}`, { defaultValue: user.staff_role })
      : user?.role
        ? t(`common.roles.${user.role}`, { defaultValue: user.role })
        : '';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      <ImpersonationBanner />
      <PremiumPanelFrame
      sidebarOpen={sidebarOpen}
      onOpenSidebar={() => setSidebarOpen(true)}
      onCloseSidebar={() => setSidebarOpen(false)}
      pageTitle={pageTitle}
      headerExtra={
        <>
          <LanguageSwitcher variant="light" className="hidden sm:flex" />
          <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200/60 sm:inline">
            {company?.company_name}
          </span>
          <PanelNotificationBell companyId={company?.id} />
        </>
      }
      sidebar={
        <PremiumSidebar
          theme="company"
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          settingsPath="/panel/settings"
          onLogout={handleLogout}
          brand={
            <>
              <CompanyLogo logo={company?.logo} companyName={company?.company_name} size="sm" />
              <div className="min-w-0 flex-1">
                <h1 className="sidebar-premium-title text-sm font-bold tracking-tight">
                  {company?.company_name || t('layout.whatsappAiBrand')}
                </h1>
                <p className="truncate text-[11px] text-slate-400">
                  {isStaff ? t('layout.staffPanel') : t('layout.customerPanel')}
                </p>
              </div>
            </>
          }
          badge={
            isStaff ? (
              <div className="sidebar-premium-plan mt-2.5 flex items-center gap-2 rounded-xl px-3 py-2">
                <UserCog className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="truncate text-[11px] font-semibold capitalize text-emerald-300">
                  {roleLabel}
                </span>
              </div>
            ) : planType ? (
              <div className="sidebar-premium-plan mt-2.5 flex items-center gap-2 rounded-xl px-3 py-2">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="truncate text-[11px] font-semibold text-emerald-300">
                  {t(`common.plans.${planType}`, { defaultValue: planType })}
                </span>
              </div>
            ) : null
          }
          groups={visibleGroups}
          userCard={
            <>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="sidebar-premium-avatar">
                    {user?.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <span className="sidebar-premium-status absolute -bottom-0.5 -right-0.5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{user?.full_name}</p>
                  <p className="truncate text-[11px] capitalize text-slate-400">{roleLabel}</p>
                </div>
              </div>
              <p className="mt-2.5 text-[10px] font-medium tracking-wide text-accent/80">
                {t('layout.accountSettings')}
              </p>
            </>
          }
        />
      }
    >
      <Outlet />
    </PremiumPanelFrame>
    </>
  );
}
