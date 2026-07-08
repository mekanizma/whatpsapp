/**
 * Dashboard stat card — professional metric display
 */

import { Link } from 'react-router-dom';
import { ChevronRight, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  /** Kısa trend / durum metni (sayı altında) */
  trend?: string;
  /** Uzun açıklama — başlık yanında bilgi ikonu */
  hint?: string;
  color?: string;
  bgColor?: string;
  to?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  hint,
  color = 'text-primary',
  bgColor = 'bg-primary/10',
  to,
}: StatCardProps) {
  const inner = (
    <CardContent className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
            {hint && (
              <span
                className="group/hint relative inline-flex shrink-0"
                onClick={(e) => e.preventDefault()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="rounded-full p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label={hint}
                  title={hint}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <Info className="h-3.5 w-3.5" aria-hidden />
                </button>
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-left text-[11px] font-normal leading-relaxed normal-case tracking-normal text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/hint:opacity-100 group-focus-within/hint:opacity-100 sm:w-64"
                >
                  {hint}
                </span>
              </span>
            )}
          </div>
          <p className="text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">{value}</p>
          {trend && <p className="text-xs text-slate-400">{trend}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', bgColor)}>
            <Icon className={cn('h-6 w-6', color)} />
          </div>
          {to && <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden />}
        </div>
      </div>
    </CardContent>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
      >
        <Card className="overflow-hidden transition-all duration-200 group-hover:border-primary/25 group-hover:shadow-md group-active:scale-[0.99]">
          {inner}
        </Card>
      </Link>
    );
  }

  return <Card className="overflow-hidden">{inner}</Card>;
}
