/**
 * Landing footer — telif, iletişim ve yasal linkler
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const CONTACT_EMAIL = 'info@mekanizma.com';

export function LandingFooter() {
  const { t } = useTranslation();

  return (
    <footer className="landing-footer">
      <p className="landing-footer-text">
        <span>{t('onboarding.footer.copyright', { year: new Date().getFullYear() })}</span>
        <span className="landing-footer-sep" aria-hidden>·</span>
        <a href={`mailto:${CONTACT_EMAIL}`} className="landing-footer-link">
          {CONTACT_EMAIL}
        </a>
        <span className="landing-footer-sep" aria-hidden>·</span>
        <span>{t('onboarding.footer.address')}</span>
      </p>
      <nav className="landing-footer-legal" aria-label={t('legal.navLabel')}>
        <Link to="/terms" className="landing-footer-link">
          {t('legal.terms.nav')}
        </Link>
        <span className="landing-footer-sep" aria-hidden>·</span>
        <Link to="/privacy" className="landing-footer-link">
          {t('legal.privacy.nav')}
        </Link>
        <span className="landing-footer-sep" aria-hidden>·</span>
        <Link to="/deletion" className="landing-footer-link">
          {t('legal.deletion.nav')}
        </Link>
      </nav>
    </footer>
  );
}
