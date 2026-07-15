/**
 * Landing CTA — gece senaryosu + net aksiyon (hero tekrarından kaçınır)
 */

import { ArrowRight, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { LiveDemoButton, LiveDemoHint } from '@/components/onboarding/LiveDemoButton';
import { cn } from '@/lib/utils';

interface LandingCtaSectionProps {
  onLogin: () => void;
}

type SceneMessage = {
  from: 'customer' | 'ai';
  text: string;
};

export function LandingCtaSection({ onLogin }: LandingCtaSectionProps) {
  const { t } = useTranslation();
  const sceneMessages = t('onboarding.cta.sceneMessages', {
    returnObjects: true,
  }) as SceneMessage[];

  return (
    <div className="landing-cta-inner">
      <div className="landing-cta-layout">
        <div className="landing-cta-scene" aria-hidden>
          <div className="landing-cta-scene-sky" />
          <div className="landing-cta-scene-glow" />

          <div className="landing-cta-phone">
            <div className="landing-cta-phone-notch" />
            <div className="landing-cta-phone-status">
              <span className="landing-cta-phone-clock">{t('onboarding.cta.sceneClock')}</span>
              <span className="landing-cta-phone-live">
                <span className="landing-cta-phone-live-dot" />
                {t('onboarding.cta.sceneLive')}
              </span>
            </div>

            <div className="landing-cta-chat">
              {sceneMessages.map((msg, i) => (
                <div
                  key={`${msg.from}-${i}`}
                  className={cn(
                    'landing-cta-bubble',
                    msg.from === 'customer' ? 'landing-cta-bubble-in' : 'landing-cta-bubble-out'
                  )}
                  style={{ animationDelay: `${0.15 + i * 0.45}s` }}
                >
                  {msg.text}
                </div>
              ))}
              <div
                className="landing-cta-typing"
                style={{ animationDelay: `${0.15 + sceneMessages.length * 0.45}s` }}
              >
                <span />
                <span />
                <span />
              </div>
            </div>

            <div className="landing-cta-speed">
              <div className="landing-cta-speed-chip">
                <span className="landing-cta-speed-icon" aria-hidden>
                  <Zap className="h-3.5 w-3.5" fill="currentColor" />
                </span>
                <span className="landing-cta-speed-value">{t('onboarding.cta.sceneSpeedValue')}</span>
              </div>
              <span className="landing-cta-speed-label">{t('onboarding.cta.sceneSpeedLabel')}</span>
            </div>
          </div>
        </div>

        <div className="landing-cta-copy">
          <p className="landing-cta-kicker">{t('onboarding.cta.kicker')}</p>
          <h2 className="landing-cta-title">
            <span className="landing-cta-title-lead">{t('onboarding.cta.titleLead')}</span>
            <span className="landing-cta-title-accent">{t('onboarding.cta.titleAccent')}</span>
          </h2>
          <p className="landing-cta-description">{t('onboarding.cta.description')}</p>

          <ul className="landing-cta-stakes" aria-label={t('onboarding.cta.stakesLabel')}>
            {(t('onboarding.cta.stakes', { returnObjects: true }) as string[]).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <div className="landing-cta-actions">
            <div className="landing-cta-btn-row">
              <Button
                type="button"
                size="lg"
                onClick={onLogin}
                className="landing-primary-btn landing-cta-btn group h-12 w-full rounded-full px-10 text-sm font-semibold sm:w-auto"
              >
                {t('onboarding.cta.primary')}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Button>
              <LiveDemoButton variant="button" showHint={false} className="w-full sm:w-auto" />
            </div>
            <LiveDemoHint className="landing-cta-live-hint" />
          </div>
        </div>
      </div>
    </div>
  );
}
