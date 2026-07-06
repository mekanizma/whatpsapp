/**
 * Landing CTA — son çağrı bölümü
 */

import { ArrowRight, Rocket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';

interface LandingCtaSectionProps {
  onLogin: () => void;
}

export function LandingCtaSection({ onLogin }: LandingCtaSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="landing-cta-inner">
      <div className="landing-cta-badge">
        <Rocket className="h-3.5 w-3.5 text-[#25d366]" aria-hidden />
        {t('onboarding.cta.badge')}
      </div>

      <h2 className="landing-cta-title">
        <span className="landing-cta-title-lead">{t('onboarding.cta.titleLead')}</span>
        <span className="landing-cta-title-accent">{t('onboarding.cta.titleAccent')}</span>
      </h2>

      <p className="landing-cta-description">{t('onboarding.cta.description')}</p>

      <div className="landing-cta-actions">
        <Button
          type="button"
          size="lg"
          onClick={onLogin}
          className="landing-primary-btn landing-cta-btn group h-12 rounded-full px-10 text-sm font-semibold"
        >
          {t('auth.login')}
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </Button>
        <p className="landing-cta-hint">{t('onboarding.cta.buttonHint')}</p>
      </div>
    </div>
  );
}
