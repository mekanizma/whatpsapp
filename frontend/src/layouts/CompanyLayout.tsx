/**
 * Müşteri (şirket) panel layout
 */

import { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, BookOpen, Users, Ticket,
  LogOut, Menu, X, CreditCard, Smartphone, Bell,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import type { UserRole } from '@/types';

const allNav = [
  { to: '/panel/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['company_admin', 'staff'] as UserRole[] },
  { to: '/panel/messages', icon: MessageSquare, label: 'Mesajlar', roles: ['company_admin', 'staff'] as UserRole[] },
  { to: '/panel/knowledge', icon: BookOpen, label: 'Bilgi Bankası', roles: ['company_admin'] as UserRole[] },
  { to: '/panel/tickets', icon: Ticket, label: 'Destek', roles: ['company_admin', 'staff'] as UserRole[] },
  { to: '/panel/staff', icon: Users, label: 'Personel', roles: ['company_admin'] as UserRole[] },
  { to: '/panel/whatsapp', icon: Smartphone, label: 'WhatsApp', roles: ['company_admin'] as UserRole[] },
  { to: '/panel/subscription', icon: CreditCard, label: 'Abonelik', roles: ['company_admin'] as UserRole[] },
];

const pageTitles: Record<string, string> = {
  '/panel/dashboard': 'Dashboard',
  '/panel/messages': 'Mesajlar',
  '/panel/knowledge': 'Bilgi Bankası',
  '/panel/tickets': 'Destek Talepleri',
  '/panel/staff': 'Personel',
  '/panel/whatsapp': 'WhatsApp',
  '/panel/subscription': 'Abonelik',
};

export function CompanyLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, company, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = allNav.filter((item) => user?.role && item.roles.includes(user.role));
  const pageTitle = pageTitles[location.pathname] || 'Panel';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[17.5rem] flex-col border-r border-sidebar-border bg-sidebar text-white transition-transform duration-300 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20 ring-1 ring-accent/30">
            <MessageSquare className="h-5 w-5 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold tracking-tight">WhatsApp AI</h1>
            <p className="truncate text-xs text-slate-400">{company?.company_name || 'Müşteri Paneli'}</p>
          </div>
          <button className="shrink-0 rounded-lg p-1.5 hover:bg-white/10 lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin">
          <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Menü</p>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-xl py-2.5 pl-4 pr-3 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-white/10 text-white shadow-sm before:absolute before:left-0 before:top-1/2 before:h-6 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-accent before:content-[""]'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0 group-aria-[current=page]:text-accent" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="mb-2 rounded-xl bg-white/5 px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{user?.full_name}</p>
            <p className="text-xs capitalize text-slate-400">{user?.role?.replace('_', ' ')}</p>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Çıkış Yap
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5 text-slate-700" />
            </button>
            <h2 className="text-sm font-semibold text-slate-800 sm:text-base">{pageTitle}</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200/60 sm:inline">
              {company?.company_name}
            </span>
            <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Bildirimler">
              <Bell className="h-5 w-5" />
            </button>
          </div>
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
