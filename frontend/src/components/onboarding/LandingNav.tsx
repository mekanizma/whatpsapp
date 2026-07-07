/**
 * Landing üst menü — Hizmetler / Referanslar (bölüme kaydır) + Fiyatlar (sayfa)
 */

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface LandingNavProps {
  active?: 'pricing';
}

export function LandingNav({ active }: LandingNavProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const goSection = (id: string) => {
    if (window.location.pathname === '/' || window.location.pathname === '/welcome') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      navigate(`/#${id}`);
    }
  };

  return (
    <>
      <button
        type="button"
        className="site-header-nav-link"
        onClick={() => goSection('features')}
      >
        {t('landingNav.services')}
      </button>
      <button
        type="button"
        className="site-header-nav-link"
        onClick={() => goSection('testimonials')}
      >
        {t('landingNav.references')}
      </button>
      <button
        type="button"
        className={cn('site-header-nav-link', active === 'pricing' && 'is-active')}
        onClick={() => navigate('/pricing')}
      >
        {t('landingNav.pricing')}
      </button>
    </>
  );
}
