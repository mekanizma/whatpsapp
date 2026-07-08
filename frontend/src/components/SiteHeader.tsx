/**
 * Site header — WAAI logosuna uygun üst bar
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, X } from 'lucide-react';
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
  const { t } = useTranslation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileNavOpen]);

  useEffect(() => {
    const onResize = () => {
      if (window.matchMedia('(min-width: 1024px)').matches) {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <header
      className={cn(
        'site-header',
        sticky && 'site-header-sticky',
        nav && 'site-header-has-nav',
        mobileNavOpen && 'site-header-mobile-nav-open',
        className
      )}
    >
      <div className="site-header-glow" aria-hidden />
      <div className="site-header-inner">
        {logoTo ? (
          <Link to={logoTo} className="site-header-brand" aria-label="WAAI" onClick={closeMobileNav}>
            <WaaiLogo className="site-header-logo" />
          </Link>
        ) : (
          <div className="site-header-brand">
            <WaaiLogo className="site-header-logo" />
          </div>
        )}
        {nav ? (
          <nav className="site-header-nav site-header-nav-desktop" aria-label={t('landingNav.menu')}>
            {nav}
          </nav>
        ) : null}
        {nav || children ? (
          <div className="site-header-actions">
            {nav ? (
              <button
                type="button"
                className="site-header-menu-toggle"
                aria-expanded={mobileNavOpen}
                aria-controls="site-header-mobile-nav"
                aria-label={mobileNavOpen ? t('landingNav.closeMenu') : t('landingNav.openMenu')}
                onClick={() => setMobileNavOpen((open) => !open)}
              >
                {mobileNavOpen ? <X className="site-header-menu-toggle-icon" /> : <Menu className="site-header-menu-toggle-icon" />}
              </button>
            ) : null}
            {children ? <div className="site-header-toolbar">{children}</div> : null}
          </div>
        ) : null}
      </div>
      {nav && mobileNavOpen ? (
        <nav
          id="site-header-mobile-nav"
          className="site-header-nav site-header-nav-mobile"
          aria-label={t('landingNav.menu')}
          onClick={closeMobileNav}
        >
          {nav}
        </nav>
      ) : null}
    </header>
  );
}
