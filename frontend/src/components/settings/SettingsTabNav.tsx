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
}

export function SettingsTabNav({ tabs, activeTab, onChange }: SettingsTabNavProps) {
  return (
    <div
      className="flex max-w-full gap-1 overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
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
              'flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-medium transition sm:px-4',
              selected
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="whitespace-nowrap">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
