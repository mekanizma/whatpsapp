/**
 * Landing hizmetler — zengin, detaylı bento kartları
 */

import {
  Bot, BookOpen, Brain, Calendar, CheckCircle2, Clock,
  FileText, Headphones, Languages, MessageSquare, Sparkles,
  Tag, Ticket, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { AiEngineGraphic, KnowledgeGraphic } from '@/components/onboarding/OnboardingVisuals';

const ITEM_ICONS: Record<string, LucideIcon> = {
  Brain,
  Languages,
  Sparkles,
  Zap,
  MessageSquare,
  Headphones,
  BookOpen,
  FileText,
  Tag,
  Calendar,
  Ticket,
  Clock,
};

interface FeatureItem {
  icon: string;
  label: string;
  desc: string;
}

interface FeatureCard {
  badge: string;
  title: string;
  description: string;
  items: FeatureItem[];
}

const CARD_ICONS = [Bot, BookOpen] as const;
const CARD_VISUALS = [AiEngineGraphic, KnowledgeGraphic] as const;
const CARD_SPANS = ['lg:col-span-7', 'lg:col-span-5'] as const;

export function LandingFeaturesSection() {
  const { t } = useTranslation();
  const cards = t('onboarding.featureCards', { returnObjects: true }) as FeatureCard[];

  return (
    <div className="mx-auto max-w-7xl">
      <div className="landing-section-header">
        <p className="landing-section-label">{t('onboarding.featuresLabel')}</p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-4xl">
          {t('onboarding.featuresTitle')}
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-slate-400 sm:text-base">
          {t('onboarding.featuresSubtitle')}
        </p>
      </div>

      <div className="mt-12 grid gap-5 lg:grid-cols-12">
        {cards.map((card, i) => {
          const CardIcon = CARD_ICONS[i];
          const Visual = CARD_VISUALS[i];

          return (
            <article
              key={card.badge}
              className={cn('landing-bento-card group', CARD_SPANS[i])}
            >
              <div className="landing-bento-shine" />
              <div className="relative z-10 flex h-full flex-col p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="landing-bento-badge">{card.badge}</span>
                    <h3 className="mt-4 text-lg font-semibold text-white sm:text-xl">
                      {card.title}
                    </h3>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
                      {card.description}
                    </p>
                  </div>
                  <div className="landing-bento-icon">
                    {CardIcon && <CardIcon className="h-5 w-5 text-[#25d366]" />}
                  </div>
                </div>

                <ul className="landing-feature-list">
                  {card.items.map((item) => {
                    const ItemIcon = ITEM_ICONS[item.icon] ?? CheckCircle2;
                    return (
                      <li key={item.label} className="landing-feature-item">
                        <span className="landing-feature-item-icon">
                          <ItemIcon className="h-4 w-4" />
                        </span>
                        <span className="landing-feature-item-text">
                          <span className="landing-feature-item-label">{item.label}</span>
                          <span className="landing-feature-item-desc">{item.desc}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-auto flex justify-center pt-8 lg:justify-start">
                  <Visual />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
