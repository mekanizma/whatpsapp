/**
 * Site header — WAAI logosuna uygun üst bar
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { WaaiLogo } from '@/components/WaaiLogo';
import { cn } from '@/lib/utils';

interface SiteHeaderProps {
  children?: ReactNode;
  nav?: ReactNode;
  className?: string;
  sticky?: boolean;
  logoTo?: string;
}

export function SiteHeader({ children, nav, className, sticky = false, logoTo }: SiteHeaderProps) {
  return (
    <header
      className={cn(
        'site-header',
        sticky && 'site-header-sticky',
        nav && 'site-header-has-nav',
        className
      )}
    >
      <div className="site-header-glow" aria-hidden />
      <div className="site-header-inner">
        {logoTo ? (
          <Link to={logoTo} className="site-header-brand" aria-label="WAAI">
            <WaaiLogo className="site-header-logo" />
          </Link>
        ) : (
          <div className="site-header-brand">
            <WaaiLogo className="site-header-logo" />
          </div>
        )}
        {nav ? (
          <nav className="site-header-nav" aria-label="Ana menü">
            {nav}
          </nav>
        ) : null}
        {children ? (
          <div className="site-header-toolbar">{children}</div>
        ) : null}
      </div>
    </header>
  );
}
