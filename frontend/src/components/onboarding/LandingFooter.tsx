/**
 * Landing footer — tek satır telif ve iletişim
 */

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
    </footer>
  );
}
