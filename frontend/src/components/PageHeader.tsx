/**
 * Consistent page header across panel pages
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between min-w-0 max-w-full', className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="truncate text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && (
          <p className="text-sm text-slate-500 max-w-2xl">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
