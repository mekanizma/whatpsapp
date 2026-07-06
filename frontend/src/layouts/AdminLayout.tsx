/**
 * Admin panel layout — premium sidebar (firma paneli ile aynı tasarım dili)
 */

import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Shield, Building2, BarChart3, Settings, Zap, Activity, FileText, CreditCard, Users, Smartphone, Headphones,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { PremiumPanelFrame, PremiumSidebar, type PremiumNavGroup } from '@/components/layout/PremiumSidebar';

const adminNavGroups: { sectionKey: string; items: { to: string; icon: typeof BarChart3; labelKey: string; end?: boolean }[] }[] = [
  {
    sectionKey: 'layout.navSections.overview',
    items: [
      { to: '/admin', icon: BarChart3, labelKey: 'layout.nav.adminOverview', end: true },
    ],
  },
  {
    sectionKey: 'layout.navSections.management',
    items: [
      { to: '/admin/companies', icon: Building2, labelKey: 'layout.nav.companies' },
      { to: '/admin/users', icon: Users, labelKey: 'layout.nav.users' },
      { to: '/admin/plans', icon: CreditCard, labelKey: 'layout.nav.plans' },
    ],
  },
  {
    sectionKey: 'layout.navSections.operations',
    items: [
      { to: '/admin/usage', icon: Zap, labelKey: 'layout.nav.usage' },
      { to: '/admin/whatsapp-health', icon: Smartphone, labelKey: 'layout.nav.whatsappHealth' },
      { to: '/admin/support-tickets', icon: Headphones, labelKey: 'layout.nav.supportTickets' },
      { to: '/admin/activity', icon: Activity, labelKey: 'layout.nav.activity' },
      { to: '/admin/prompts', icon: FileText, labelKey: 'layout.nav.prompts' },
    ],
  },
  {
    sectionKey: 'layout.navSections.account',
    items: [
      { to: '/admin/settings', icon: Settings, labelKey: 'layout.nav.adminSettings' },
    ],
  },
];

function resolvePageTitleKey(pathname: string): string {
  if (pathname.startsWith('/admin/companies/') && pathname !== '/admin/companies') {
    return 'layout.nav.companyDetail';
  }
  const map: Record<string, string> = {
    '/admin': 'layout.nav.adminOverview',
    '/admin/companies': 'layout.nav.companies',
    '/admin/usage': 'layout.nav.usage',
    '/admin/whatsapp-health': 'layout.nav.whatsappHealth',
    '/admin/support-tickets': 'layout.nav.supportTickets',
    '/admin/activity': 'layout.nav.activity',
    '/admin/prompts': 'layout.nav.prompts',
    '/admin/plans': 'layout.nav.plans',
    '/admin/users': 'layout.nav.users',
    '/admin/settings': 'layout.nav.adminSettings',
  };
  return map[pathname] || 'layout.adminPanel';
}

export function AdminLayout() {
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const pageTitle = t(resolvePageTitleKey(location.pathname));

  const groups: PremiumNavGroup[] = adminNavGroups.map((group) => ({
    sectionLabel: t(group.sectionKey),
    items: group.items.map((item) => ({
      to: item.to,
      icon: item.icon,
      label: t(item.labelKey),
      end: item.end,
    })),
  }));

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  return (
    <PremiumPanelFrame
      sidebarOpen={sidebarOpen}
      onOpenSidebar={() => setSidebarOpen(true)}
      onCloseSidebar={() => setSidebarOpen(false)}
      pageTitle={pageTitle}
      headerExtra={<LanguageSwitcher variant="light" />}
      sidebar={
        <PremiumSidebar
          theme="admin"
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          settingsPath="/admin/settings"
          onLogout={handleLogout}
          brand={
            <>
              <div className="sidebar-premium-logo flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
                <Shield className="h-5 w-5 text-amber-300 drop-shadow-[0_0_10px_rgb(251_191_36/0.5)]" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="sidebar-premium-title text-sm font-bold tracking-tight">
                  {t('layout.adminPanel')}
                </h1>
                <p className="truncate text-[11px] text-slate-400">
                  {t('layout.platformManagement')}
                </p>
              </div>
            </>
          }
          badge={
            <div className="sidebar-premium-plan mt-2.5 flex items-center gap-2 rounded-xl px-3 py-2">
              <Shield className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span className="truncate text-[11px] font-semibold text-amber-200">
                {t('common.roles.super_admin')}
              </span>
            </div>
          }
          groups={groups}
          userCard={
            <>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="sidebar-premium-avatar !text-amber-300">
                    {user?.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <span className="sidebar-premium-status !bg-amber-400 !shadow-[0_0_8px_rgb(251_191_36/0.8)] absolute -bottom-0.5 -right-0.5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{user?.full_name}</p>
                  <p className="truncate text-[11px] text-amber-300/90">{t('common.roles.super_admin')}</p>
                </div>
              </div>
              <p className="mt-2.5 text-[10px] font-medium tracking-wide text-amber-300/80">
                {t('layout.nav.adminSettings')} →
              </p>
            </>
          }
        />
      }
    >
      <Outlet />
    </PremiumPanelFrame>
  );
}
