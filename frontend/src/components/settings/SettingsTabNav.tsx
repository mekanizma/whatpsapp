import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SettingsTabId = 'profile' | 'security' | 'company' | 'notifications';

export interface SettingsTabItem {
  id: SettingsTabId;
  label: string;
  icon: LucideIcon;
}

interface SettingsTabNavProps {
  tabs: SettingsTabItem[];
  activeTab: SettingsTabId;
  onChange: (tab: SettingsTabId) => void;
  className?: string;
}

export function SettingsTabNav({ tabs, activeTab, onChange, className }: SettingsTabNavProps) {
  return (
    <nav
      className={cn(
        'flex max-w-full gap-1 overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-[var(--shadow-card)]',
        'lg:flex-col lg:overflow-visible lg:p-2',
        className
      )}
      role="tablist"
      aria-label="Settings sections"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const selected = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex min-h-[44px] shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all sm:px-4',
              'lg:w-full lg:justify-start',
              selected
                ? 'bg-primary text-white shadow-sm shadow-primary/20'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="whitespace-nowrap">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
