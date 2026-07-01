/**
 * Auth form kabuğu — giriş animasyonları
 */

import type { ReactNode, FormEvent } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

interface AuthFormShellProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  onSubmit?: (e: FormEvent) => void;
  accent?: 'teal' | 'amber';
}

export function AuthFormShell({
  icon,
  title,
  subtitle,
  children,
  footer,
  onSubmit,
  accent = 'teal',
}: AuthFormShellProps) {
  const isAmber = accent === 'amber';

  return (
    <div
      className={cn(
        'auth-page relative flex w-full min-w-0 flex-1 flex-col overflow-x-hidden p-4 sm:p-6 lg:min-h-full lg:items-center lg:justify-center lg:p-8',
        isAmber
          ? 'bg-gradient-to-br from-slate-950 via-stone-950 to-slate-900'
          : 'bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950'
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 auth-grid-pattern opacity-[0.15]" />
        <div
          className={cn(
            'absolute -left-16 top-0 h-56 w-56 rounded-full blur-3xl sm:-left-20 sm:h-72 sm:w-72',
            isAmber ? 'bg-amber-500/15' : 'bg-teal-500/20'
          )}
        />
        <div
          className={cn(
            'absolute -bottom-12 -right-12 h-48 w-48 rounded-full blur-3xl sm:-bottom-16 sm:-right-16 sm:h-64 sm:w-64',
            isAmber ? 'bg-orange-500/10' : 'bg-emerald-500/15'
          )}
        />
      </div>

      <div className="relative z-20 mb-4 flex shrink-0 justify-end lg:absolute lg:right-6 lg:top-6 lg:mb-0">
        <LanguageSwitcher variant="dark" />
      </div>

      <div className="relative z-10 mx-auto w-full min-w-0 max-w-md flex-1 space-y-5 pb-6 sm:space-y-8 sm:pb-8 lg:flex-none">
        <div className="text-center lg:text-left">
          <div
            className={cn(
              'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ring-1 lg:mx-0',
              isAmber
                ? 'bg-amber-500/15 ring-amber-400/30'
                : 'bg-teal-500/15 ring-teal-400/30'
            )}
          >
            {icon}
          </div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>
        </div>

        <Card className="overflow-hidden border-0 bg-white shadow-2xl shadow-black/40 ring-1 ring-white/10">
          <div
            className={cn(
              'h-1.5 w-full',
              isAmber
                ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500'
                : 'bg-gradient-to-r from-teal-400 via-primary to-emerald-500'
            )}
          />
          <CardContent className="p-4 text-slate-900 sm:p-8 [&_input]:border-slate-300 [&_input]:bg-slate-50 [&_input]:text-slate-900 [&_input]:placeholder:text-slate-500 [&_label]:font-semibold [&_label]:text-slate-800">
            {onSubmit ? (
              <form onSubmit={onSubmit} className="space-y-5">
                {children}
              </form>
            ) : (
              children
            )}
          </CardContent>
        </Card>

        <div className="text-slate-400 [&_a]:break-words">{footer}</div>
      </div>
    </div>
  );
}
