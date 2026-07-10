import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SettingsSectionProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}

export function SettingsSection({ title, description, icon: Icon, children, className }: SettingsSectionProps) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-slate-200/80 bg-white p-5 ring-1 ring-slate-100 sm:p-6',
        className
      )}
    >
      <div className="mb-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {Icon && <Icon className="h-4 w-4 text-primary" aria-hidden />}
          {title}
        </h3>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

interface SettingsActionBarProps {
  children: ReactNode;
  feedback?: ReactNode;
}

export function SettingsActionBar({ children, feedback }: SettingsActionBarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-h-[1.25rem] flex-1">{feedback}</div>
      <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">{children}</div>
    </div>
  );
}
