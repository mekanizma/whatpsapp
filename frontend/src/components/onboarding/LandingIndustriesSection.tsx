/**
 * Landing sektörler — işletme türlerine özel kullanım senaryoları
 */

import {
  Building2, Car, Coffee, Dumbbell, GraduationCap,
  Hotel, Package, Scissors, ShoppingBag, Sparkles,
  Stethoscope, Wrench,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const ICON_MAP = {
  Coffee,
  Hotel,
  Car,
  Sparkles,
  Scissors,
  Stethoscope,
  Dumbbell,
  Building2,
  ShoppingBag,
  Package,
  GraduationCap,
  Wrench,
} as const;

type IconKey = keyof typeof ICON_MAP;

interface Industry {
  icon: string;
  name: string;
  tagline: string;
  useCases: string[];
}

export function LandingIndustriesSection() {
  const { t } = useTranslation();
  const industries = t('onboarding.industries', { returnObjects: true }) as Industry[];

  return (
    <div className="landing-industries-section">
      <div className="landing-industries-header">
        <div className="landing-industries-header-copy landing-section-header">
          <div className="landing-industries-eyebrow">
            <span className="landing-industries-eyebrow-dot" aria-hidden />
            {t('onboarding.industriesLabel')}
          </div>
          <h2 className="landing-industries-title">
            <span className="landing-industries-title-lead">
              {t('onboarding.industriesTitleLead')}
            </span>
            <span className="landing-industries-title-accent">
              {t('onboarding.industriesTitleAccent')}
            </span>
          </h2>
          <p className="landing-industries-subtitle">
            {t('onboarding.industriesSubtitle')}
          </p>
        </div>
      </div>

      <div className="landing-industries-grid">
        {industries.map(({ icon, name, tagline, useCases }, i) => {
          const Icon = ICON_MAP[icon as IconKey] ?? Coffee;
          return (
            <article
              key={name}
              className={cn('li-parent', `li-parent--${(i % 6) + 1}`)}
            >
              <div className="li-card">
                <div className="li-logo" aria-hidden>
                  <span className="li-circle" />
                  <span className="li-circle" />
                  <span className="li-circle" />
                  <span className="li-circle" />
                  <span className="li-circle">
                    <Icon className="li-icon" />
                  </span>
                </div>
                <div className="li-glass" aria-hidden />
                <div className="li-content">
                  <span className="li-title">{name}</span>
                  <span className="li-text">{tagline}</span>
                  <div className="li-chips">
                    {useCases.map((useCase) => (
                      <span key={useCase} className="li-chip">{useCase}</span>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
