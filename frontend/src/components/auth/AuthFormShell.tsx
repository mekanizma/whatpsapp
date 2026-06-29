/**
 * Auth form kabuğu — giriş animasyonları
 */

import type { ReactNode, FormEvent } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui';

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
        'auth-page relative flex w-full flex-1 items-center justify-center p-4 sm:p-6 lg:min-h-full lg:p-8',
        isAmber
          ? 'bg-gradient-to-br from-slate-950 via-stone-950 to-slate-900'
          : 'bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950'
      )}
    >
      <div className="pointer-events-none absolute inset-0 auth-grid-pattern opacity-[0.15]" />
      <div
        className={cn(
          'pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full blur-3xl',
          isAmber ? 'bg-amber-500/15' : 'bg-teal-500/20'
        )}
      />
      <div
        className={cn(
          'pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full blur-3xl',
          isAmber ? 'bg-orange-500/10' : 'bg-emerald-500/15'
        )}
      />

      <div className="relative z-10 w-full max-w-md space-y-6 sm:space-y-8">
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
          <CardContent className="p-6 text-slate-900 sm:p-8 [&_input]:border-slate-300 [&_input]:bg-slate-50 [&_input]:text-slate-900 [&_input]:placeholder:text-slate-500 [&_label]:font-semibold [&_label]:text-slate-800">
            {onSubmit ? (
              <form onSubmit={onSubmit} className="space-y-5">
                {children}
              </form>
            ) : (
              children
            )}
          </CardContent>
        </Card>

        <div className="text-slate-400">{footer}</div>
      </div>
    </div>
  );
}
