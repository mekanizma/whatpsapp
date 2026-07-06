/**
 * Landing modüller — yetenek kartları bölümü
 */

import {
  BookOpen, Bot, Calendar, Headphones, LayoutDashboard,
  MessageSquare, Shield, Ticket,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const ICON_MAP = {
  MessageSquare,
  Bot,
  BookOpen,
  Headphones,
  Calendar,
  Ticket,
  LayoutDashboard,
  Shield,
} as const;

type IconKey = keyof typeof ICON_MAP;

interface Capability {
  icon: string;
  label: string;
  description: string;
}

export function LandingModulesSection() {
  const { t } = useTranslation();

  const capabilities = t('onboarding.capabilities', { returnObjects: true }) as Capability[];

  return (
    <div className="landing-modules-section">
      <div className="landing-modules-header">
        <div className="landing-modules-header-copy">
          <div className="landing-modules-eyebrow">
            <span className="landing-modules-eyebrow-dot" aria-hidden />
            {t('onboarding.capabilitiesLabel')}
          </div>
          <h2 className="landing-modules-title">
            <span className="landing-modules-title-lead">
              {t('onboarding.capabilitiesTitleLead')}
            </span>
            <span className="landing-modules-title-accent">
              {t('onboarding.capabilitiesTitleAccent')}
            </span>
          </h2>
          <p className="landing-modules-subtitle">
            {t('onboarding.capabilitiesSubtitle')}
          </p>
        </div>
      </div>

      <div className="landing-modules-grid">
        {capabilities.map(({ icon, label, description }, i) => {
          const Icon = ICON_MAP[icon as IconKey] ?? MessageSquare;
          return (
            <article
              key={label}
              className={cn('landing-module-card', `landing-module-card-${i + 1}`)}
            >
              <div className="landing-module-card-shine" aria-hidden />
              <div className="landing-module-card-top">
                <div className="landing-module-icon">
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <span className="landing-module-index" aria-hidden>
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <h3 className="landing-module-label">{label}</h3>
              <p className="landing-module-desc">{description}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
