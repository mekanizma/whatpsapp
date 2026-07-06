/**
 * Landing — tek sayfa tanıtım (login öncesi)
 */

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight, Bot, BookOpen,
} from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  HeroShowcase, AiEngineGraphic, KnowledgeGraphic,
} from '@/components/onboarding/OnboardingVisuals';
import { HeroTitle } from '@/components/onboarding/HeroTitle';
import { LandingStatCards } from '@/components/onboarding/LandingStatCards';
import { LandingModulesSection } from '@/components/onboarding/LandingModulesSection';
import { LandingCtaSection } from '@/components/onboarding/LandingCtaSection';

const FEATURE_ICONS = [Bot, BookOpen] as const;
const FEATURE_VISUALS = [AiEngineGraphic, KnowledgeGraphic] as const;
const BENTO_SPANS = ['lg:col-span-7', 'lg:col-span-5'] as const;

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const slides = t('onboarding.slides', { returnObjects: true }) as {
    badge: string;
    title: string;
    description: string;
    highlights: string[];
  }[];

  const stats = t('onboarding.stats', { returnObjects: true }) as { value: string; label: string }[];
  const hero = slides[0];
  const featureSlides = slides.slice(1, 3);
  const marquee = t('showcase.customerMarquee', { returnObjects: true }) as string[];

  return (
    <div className="landing-page auth-page min-h-[100dvh] overflow-x-clip text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#020617]" />
        <div className="landing-aurora" />
        <div className="landing-noise" />
        <div className="auth-grid-pattern absolute inset-0 opacity-[0.035]" />
      </div>

      <SiteHeader sticky>
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

      <main>
        {/* Hero */}
        <section className="relative px-4 pb-20 pt-6 sm:px-8 sm:pb-28 sm:pt-10">
          <div className="mx-auto max-w-7xl">
            <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-10">
              <div className="landing-hero-copy">
                <HeroTitle
                  lead={t('onboarding.heroTitleLead')}
                  accent={t('onboarding.heroTitleAccent')}
                />
                <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-400 sm:text-lg">
                  {hero.description}
                </p>
                <div className="mt-8">
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => navigate('/login')}
                    className="landing-primary-btn group h-12 rounded-full px-8 text-sm font-semibold"
                  >
                    {t('auth.login')}
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </Button>
                </div>
              </div>
              <div className="flex justify-center lg:justify-end">
                <HeroShowcase />
              </div>
            </div>
          </div>
        </section>

        {/* Marquee */}
        <section className="landing-marquee-section border-y border-white/[0.06] py-4">
          <div className="landing-marquee-track">
            {[...marquee, ...marquee].map((item, i) => (
              <span key={`${item}-${i}`} className="landing-marquee-item">{item}</span>
            ))}
          </div>
        </section>

        {/* Stats */}
        <section className="px-4 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <LandingStatCards stats={stats} />
          </div>
        </section>

        {/* Bento özellikler */}
        <section className="px-4 pb-20 sm:px-8 sm:pb-28" id="features">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="landing-section-label">{t('onboarding.featuresLabel')}</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-4xl">
                {t('onboarding.featuresTitle')}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-400 sm:text-base">
                {t('onboarding.featuresSubtitle')}
              </p>
            </div>

            <div className="mt-12 grid gap-5 lg:grid-cols-12">
              {featureSlides.map((feature, i) => {
                const Icon = FEATURE_ICONS[i];
                const Visual = FEATURE_VISUALS[i];

                return (
                  <article
                    key={feature.badge}
                    className={cn('landing-bento-card group', BENTO_SPANS[i])}
                  >
                    <div className="landing-bento-shine" />
                    <div className="relative z-10 flex h-full flex-col p-6 sm:p-8">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <span className="landing-bento-badge">{feature.badge}</span>
                          <h3 className="mt-4 text-lg font-semibold text-white sm:text-xl">
                            {feature.title}
                          </h3>
                          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
                            {feature.description}
                          </p>
                        </div>
                        <div className="landing-bento-icon">
                          <Icon className="h-5 w-5 text-[#25d366]" />
                        </div>
                      </div>
                      <ul className="mt-5 flex flex-wrap gap-2">
                        {feature.highlights.map((h) => (
                          <li key={h} className="landing-chip-sm">{h}</li>
                        ))}
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
        </section>

        {/* Yetenekler */}
        <section className="border-t border-white/[0.06] px-4 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <LandingModulesSection />
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-8">
          <div className="landing-cta-panel mx-auto max-w-7xl">
            <div className="landing-cta-glow" aria-hidden />
            <div className="landing-cta-mesh" aria-hidden />
            <LandingCtaSection onLogin={() => navigate('/login')} />
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] px-4 py-8 text-center sm:px-8">
        <p className="text-xs text-slate-600">
          © {new Date().getFullYear()} {t('showcase.copyright')}
        </p>
      </footer>
    </div>
  );
}
