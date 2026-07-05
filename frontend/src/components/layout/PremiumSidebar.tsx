/**
 * Premium 2026 panel sidebar — firma, personel ve admin panellerinde ortak
 */

import { useEffect, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { LogOut, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';

export type PremiumNavItem = {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  end?: boolean;
};

export type PremiumNavGroup = {
  sectionLabel: string;
  items: PremiumNavItem[];
};

type PremiumSidebarTheme = 'company' | 'admin';

interface PremiumSidebarProps {
  theme?: PremiumSidebarTheme;
  open: boolean;
  onClose: () => void;
  brand: ReactNode;
  badge?: ReactNode;
  groups: PremiumNavGroup[];
  userCard: ReactNode;
  onLogout: () => void;
  settingsPath?: string;
}

export function PremiumSidebar({
  theme = 'company',
  open,
  onClose,
  brand,
  badge,
  groups,
  userCard,
  onLogout,
  settingsPath,
}: PremiumSidebarProps) {
  const { t } = useTranslation();

  return (
    <aside
      data-sidebar-theme={theme}
      className={cn(
        'sidebar-premium fixed inset-y-0 left-0 z-50 flex w-[min(18.5rem,100vw)] max-w-full flex-col overflow-hidden text-white transition-transform duration-300 ease-out',
        'lg:relative lg:my-3 lg:ml-3 lg:h-[calc(100dvh-1.5rem)] lg:w-[18.5rem] lg:rounded-2xl lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full pointer-events-none lg:pointer-events-auto',
      )}
    >
      <div className="sidebar-premium-bg" aria-hidden>
        <div className="sidebar-premium-mesh" />
        <div className="sidebar-premium-grid" />
        <div className="sidebar-premium-orb sidebar-premium-orb-1" />
        <div className="sidebar-premium-orb sidebar-premium-orb-2" />
      </div>

      <div className="relative z-10 shrink-0 p-3 pt-3.5 sm:p-4">
        <div className="sidebar-premium-brand flex items-center gap-3 rounded-2xl p-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">{brand}</div>
          <button
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {badge}
      </div>

      <nav className="relative z-10 flex-1 space-y-4 overflow-y-auto px-3 py-1 scrollbar-thin sm:px-4">
        {groups.map((group) => (
          <div key={group.sectionLabel}>
            <p className="sidebar-premium-section mb-2 px-1">{group.sectionLabel}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn('sidebar-premium-nav group', isActive && 'sidebar-premium-nav-active')
                  }
                >
                  <span className="sidebar-premium-nav-icon">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <span className="truncate">{item.label}</span>
                  <span className="sidebar-premium-nav-dot" aria-hidden />
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="relative z-10 shrink-0 p-3 sm:p-4">
        {settingsPath ? (
          <NavLink
            to={settingsPath}
            onClick={onClose}
            className="sidebar-premium-user mb-2 block rounded-2xl p-3 transition-all"
          >
            {userCard}
          </NavLink>
        ) : (
          <div className="sidebar-premium-user mb-2 rounded-2xl p-3">{userCard}</div>
        )}
        <Button
          variant="ghost"
          className="sidebar-premium-logout h-10 w-full justify-start gap-2 rounded-xl text-sm"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4" />
          {t('common.logout')}
        </Button>
      </div>
    </aside>
  );
}

interface PremiumPanelFrameProps {
  sidebar: ReactNode;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onCloseSidebar: () => void;
  pageTitle: string;
  headerExtra?: ReactNode;
  children: ReactNode;
}

export function PremiumPanelFrame({
  sidebar,
  sidebarOpen,
  onOpenSidebar,
  onCloseSidebar,
  pageTitle,
  headerExtra,
  children,
}: PremiumPanelFrameProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!sidebarOpen) return;
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
    };
  }, [sidebarOpen]);

  return (
    <div className="app-shell fixed inset-0 flex h-[100dvh] w-full max-w-[100dvw] overflow-hidden bg-[#f0f4f8]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-md lg:hidden"
          onClick={onCloseSidebar}
        />
      )}

      {sidebar}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden lg:mr-3">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200/60 bg-white/70 px-4 backdrop-blur-xl sm:px-6 min-w-0 lg:mt-3 lg:rounded-t-2xl lg:border lg:border-b-0 lg:border-slate-200/60">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              className="shrink-0 rounded-xl p-2 text-slate-700 transition-colors hover:bg-slate-100 lg:hidden"
              onClick={onOpenSidebar}
              aria-label={t('layout.menu')}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h2 className="truncate text-sm font-semibold text-slate-800 sm:text-base">{pageTitle}</h2>
          </div>
          {headerExtra && <div className="flex shrink-0 items-center gap-2">{headerExtra}</div>}
        </header>

        <main className="flex-1 overflow-x-clip overflow-y-auto overscroll-y-contain bg-white/50 p-4 backdrop-blur-sm sm:p-6 lg:rounded-b-2xl lg:border lg:border-t-0 lg:border-slate-200/60 lg:p-8">
          <div className="page-shell">{children}</div>
        </main>
      </div>
    </div>
  );
}
