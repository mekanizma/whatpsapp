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
  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md space-y-6 sm:space-y-8">
        <div className="animate-fade-up text-center lg:text-left">
          <div
            className={cn(
              'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ring-1 lg:mx-0',
              accent === 'amber'
                ? 'bg-amber-100 ring-amber-200/80'
                : 'bg-primary/10 ring-primary/20'
            )}
          >
            {icon}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
        </div>

        <Card className="animate-fade-up-delay overflow-hidden border-slate-200/80 shadow-xl shadow-slate-200/40">
          <div
            className={cn(
              'h-1 w-full',
              accent === 'amber'
                ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600'
                : 'bg-gradient-to-r from-teal-400 via-primary to-emerald-500'
            )}
          />
          <CardContent className="p-6 sm:p-8">
            {onSubmit ? (
              <form onSubmit={onSubmit} className="space-y-5">
                {children}
              </form>
            ) : (
              children
            )}
          </CardContent>
        </Card>

        <div className="animate-fade-up-delay-2">{footer}</div>
      </div>
    </div>
  );
}
