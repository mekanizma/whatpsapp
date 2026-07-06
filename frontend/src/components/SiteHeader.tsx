/**
 * Site header — WAAI logosuna uygun üst bar
 */

import type { ReactNode } from 'react';
import { WaaiLogo } from '@/components/WaaiLogo';
import { cn } from '@/lib/utils';

interface SiteHeaderProps {
  children?: ReactNode;
  className?: string;
  sticky?: boolean;
}

export function SiteHeader({ children, className, sticky = false }: SiteHeaderProps) {
  return (
    <header
      className={cn('site-header', sticky && 'site-header-sticky', className)}
    >
      <div className="site-header-glow" aria-hidden />
      <div className="site-header-inner">
        <div className="site-header-brand">
        <WaaiLogo className="site-header-logo" />
        </div>
        {children ? (
          <div className="site-header-toolbar">{children}</div>
        ) : null}
      </div>
    </header>
  );
}
