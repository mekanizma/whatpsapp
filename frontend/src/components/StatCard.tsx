/**
 * Dashboard stat card — professional metric display
 */

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
}

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  color = 'text-primary',
  bgColor = 'bg-primary/10',
}: StatCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">{value}</p>
            {trend && <p className="text-xs text-slate-400">{trend}</p>}
          </div>
          <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', bgColor)}>
            <Icon className={cn('h-6 w-6', color)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
