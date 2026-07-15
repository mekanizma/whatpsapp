/**
 * Landing — tek sayfa tanıtım (login öncesi)
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui';
import { ChatMockup } from '@/components/onboarding/ChatMockup';
import { HeroTitle } from '@/components/onboarding/HeroTitle';
import { LandingFeaturesSection } from '@/components/onboarding/LandingFeaturesSection';
import { LandingIndustriesSection } from '@/components/onboarding/LandingIndustriesSection';
import { LandingTestimonialsSection } from '@/components/onboarding/LandingTestimonialsSection';
import { LandingCtaSection } from '@/components/onboarding/LandingCtaSection';
import { LandingChatBot } from '@/components/onboarding/LandingChatBot';
import { LiveDemoButton } from '@/components/onboarding/LiveDemoButton';
import { LandingFooter } from '@/components/onboarding/LandingFooter';
import { LandingNav } from '@/components/onboarding/LandingNav';
import { TerrariumBackground } from '@/components/onboarding/TerrariumBackground';

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const el = document.getElementById(id);
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, [location.hash]);

  const marquee = t('showcase.customerMarquee', { returnObjects: true }) as string[];

  return (
    <div className="landing-page auth-page min-h-[100dvh] overflow-x-clip text-white">
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
                <p className="landing-hero-lead">
                  {(
                    t('onboarding.slides', { returnObjects: true }) as Array<{ description: string }>
                  )[0]?.description}
                </p>
                <div className="landing-hero-actions mt-8">
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => navigate('/login')}
                    className="landing-primary-btn group h-12 w-full rounded-full px-8 text-sm font-semibold sm:w-auto"
                  >
                    {t('auth.login')}
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </Button>
                  <LiveDemoButton variant="card" className="w-full max-w-sm" />
                </div>
              </div>
              <div className="flex justify-center lg:justify-end">
                <ChatMockup size="landing" />
              </div>
            </div>
          </div>
        </section>

        {/* Bento özellikler */}
        <section className="scroll-mt-20 px-4 py-16 sm:px-8 sm:py-24" id="features">
          <LandingFeaturesSection />
        </section>

        {/* Sektörler */}
        <section className="scroll-mt-20 border-t border-white/[0.06] px-4 py-16 sm:px-8 sm:py-24" id="industries">
          <div className="mx-auto max-w-7xl">
            <LandingIndustriesSection />
          </div>
        </section>

        {/* Referanslar */}
        <section className="scroll-mt-20 border-t border-white/[0.06] px-4 py-16 sm:px-8 sm:py-24" id="testimonials">
          <div className="mx-auto max-w-7xl">
            <LandingTestimonialsSection />
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-white/[0.06] px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-16 sm:px-8 sm:pt-24">
          <div className="landing-cta-panel mx-auto max-w-7xl">
            <div className="landing-cta-glow" aria-hidden />
            <div className="landing-cta-mesh" aria-hidden />
            <LandingCtaSection onLogin={() => navigate('/login')} />
          </div>
        </section>
      </main>

      <LandingChatBot />

      {/* Marquee — footer üstü */}
      <section className="landing-marquee-section border-y border-white/[0.06] py-4">
        <div className="landing-marquee-track">
          {[...marquee, ...marquee].map((item, i) => (
            <span key={`${item}-${i}`} className="landing-marquee-item">{item}</span>
          ))}
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
