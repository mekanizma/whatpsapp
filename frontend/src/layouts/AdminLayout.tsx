/**
 * Admin panel layout
 */

import { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Shield, Building2, BarChart3, LogOut, Menu, X, Settings, Zap, Activity, FileText, CreditCard } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const adminNav = [
  { to: '/admin', icon: BarChart3, labelKey: 'layout.nav.adminOverview', end: true },
  { to: '/admin/companies', icon: Building2, labelKey: 'layout.nav.companies' },
  { to: '/admin/usage', icon: Zap, labelKey: 'layout.nav.usage' },
  { to: '/admin/activity', icon: Activity, labelKey: 'layout.nav.activity' },
  { to: '/admin/prompts', icon: FileText, labelKey: 'layout.nav.prompts' },
  { to: '/admin/plans', icon: CreditCard, labelKey: 'layout.nav.plans' },
  { to: '/admin/settings', icon: Settings, labelKey: 'layout.nav.adminSettings' },
];

function resolvePageTitleKey(pathname: string): string {
  if (pathname.startsWith('/admin/companies/') && pathname !== '/admin/companies') {
    return 'layout.nav.companyDetail';
  }
  const map: Record<string, string> = {
    '/admin': 'layout.nav.adminOverview',
    '/admin/companies': 'layout.nav.companies',
    '/admin/usage': 'layout.nav.usage',
    '/admin/activity': 'layout.nav.activity',
    '/admin/prompts': 'layout.nav.prompts',
    '/admin/plans': 'layout.nav.plans',
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

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[17.5rem] flex-col border-r border-slate-800 bg-slate-950 text-white transition-transform duration-300 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/30">
            <Shield className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold">{t('layout.adminPanel')}</h1>
            <p className="text-xs text-slate-500">{t('layout.platformManagement')}</p>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">{t('layout.management')}</p>
          {adminNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-xl py-2.5 pl-4 pr-3 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-white/10 text-amber-400 before:absolute before:left-0 before:top-1/2 before:h-6 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-amber-400 before:content-[""]'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="mb-2 rounded-xl bg-white/5 px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{user?.full_name}</p>
            <p className="text-xs text-amber-400">{t('common.roles.super_admin')}</p>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            {t('common.logout')}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="text-sm font-semibold text-slate-800 sm:text-base">{pageTitle}</h2>
          </div>
          <LanguageSwitcher variant="light" />
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="page-shell">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
