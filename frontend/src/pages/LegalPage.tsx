/**
 * Herkese açık yasal sayfalar — Kullanım Şartları, Gizlilik, Veri Silme
 */

import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Mail, Phone } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { LandingNav } from '@/components/onboarding/LandingNav';
import { LandingFooter } from '@/components/onboarding/LandingFooter';
import { TerrariumBackground } from '@/components/onboarding/TerrariumBackground';
import { SITE_BRAND } from '@/lib/site';

export type LegalDoc = 'terms' | 'privacy' | 'deletion';

interface LegalSection {
  heading: string;
  paragraphs?: string[];
  list?: string[];
}

interface LegalPageProps {
  doc: LegalDoc;
}

export function LegalPage({ doc }: LegalPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sections = t(`legal.${doc}.sections`, { returnObjects: true }) as LegalSection[];

  return (
    <div className="landing-page auth-page legal-page min-h-[100dvh] overflow-x-clip text-white">
      <TerrariumBackground />

      <SiteHeader sticky logoTo="/" nav={<LandingNav />}>
        <LanguageSwitcher variant="header" />
        <span className="site-header-divider" aria-hidden />
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="site-header-login group"
        >
          <span>{t('auth.login')}</span>
          <ArrowRight className="site-header-login-icon" aria-hidden />
        </button>
      </SiteHeader>

      <main className="legal-main">
        <div className="legal-container">
          <Link to="/" className="legal-back">
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            <span>{t('legal.backHome')}</span>
          </Link>

          <header className="legal-header">
            <p className="landing-section-label">{t('legal.label')}</p>
            <h1 className="legal-title">{t(`legal.${doc}.title`)}</h1>
            <p className="legal-updated">{t(`legal.${doc}.updated`)}</p>
            <p className="legal-intro">{t(`legal.${doc}.intro`)}</p>
          </header>

          <nav className="legal-doc-nav" aria-label={t('legal.navLabel')}>
            <Link to="/terms" className={doc === 'terms' ? 'is-active' : undefined}>
              {t('legal.terms.nav')}
            </Link>
            <Link to="/privacy" className={doc === 'privacy' ? 'is-active' : undefined}>
              {t('legal.privacy.nav')}
            </Link>
            <Link to="/deletion" className={doc === 'deletion' ? 'is-active' : undefined}>
              {t('legal.deletion.nav')}
            </Link>
          </nav>

          <article className="legal-article">
            {Array.isArray(sections) &&
              sections.map((section, index) => (
                <section key={`${doc}-${index}`} className="legal-section">
                  <h2>{section.heading}</h2>
                  {section.paragraphs?.map((p, pi) => (
                    <p key={pi}>{p}</p>
                  ))}
                  {section.list && section.list.length > 0 && (
                    <ul>
                      {section.list.map((item, li) => (
                        <li key={li}>{item}</li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
          </article>

          <aside className="legal-contact">
            <h2>{t('legal.contactTitle')}</h2>
            <p>{t('legal.contactBody')}</p>
            <div className="legal-contact-rows">
              <a href={`mailto:${SITE_BRAND.email}`} className="legal-contact-row">
                <Mail className="h-4 w-4 shrink-0" aria-hidden />
                <span>{SITE_BRAND.email}</span>
              </a>
              <a href={`tel:${SITE_BRAND.phone.replace(/\s/g, '')}`} className="legal-contact-row">
                <Phone className="h-4 w-4 shrink-0" aria-hidden />
                <span>{SITE_BRAND.phone}</span>
              </a>
              <p className="legal-contact-address">{t('onboarding.footer.address')}</p>
            </div>
          </aside>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
