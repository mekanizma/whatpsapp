/**
 * Dashboard stat card — professional metric display
 */

import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  color?: string;
  bgColor?: string;
  to?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  color = 'text-primary',
  bgColor = 'bg-primary/10',
  to,
}: StatCardProps) {
  const inner = (
    <CardContent className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
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
