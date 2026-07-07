/**
 * Fiyatlar — herkese açık abonelik paketleri (login öncesi)
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { api } from '@/services/api';
import { SiteHeader } from '@/components/SiteHeader';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { LandingNav } from '@/components/onboarding/LandingNav';
import { LandingFooter } from '@/components/onboarding/LandingFooter';
import { TerrariumBackground } from '@/components/onboarding/TerrariumBackground';
import { PlanCard } from '@/components/PlanCard';
import { BillingPeriodToggle } from '@/components/BillingPeriodToggle';
import { Spinner } from '@/components/ui';
import { planHasYearlyPrice } from '@/lib/plan-format';
import type { BillingPeriod } from '@/lib/plan-format';
import type { SubscriptionPlan } from '@/types';

export function PricingPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const navigate = useNavigate();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');

  const { data: plans, isLoading } = useQuery({
    queryKey: ['public-plans'],
    queryFn: () => api.get<SubscriptionPlan[]>('/public/plans'),
    staleTime: 5 * 60 * 1000,
  });

  const showBillingToggle = useMemo(
    () => (plans ?? []).some(planHasYearlyPrice),
    [plans]
  );

  const highlightIndex = plans && plans.length > 1 ? Math.floor((plans.length - 1) / 2) : 0;

  return (
    <div className="landing-page auth-page min-h-[100dvh] overflow-x-clip text-white">
      <TerrariumBackground />

      <SiteHeader sticky logoTo="/" nav={<LandingNav active="pricing" />}>
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

      <main className="px-4 pb-20 pt-12 sm:px-8 sm:pb-28 sm:pt-16">
        <div className="mx-auto max-w-7xl">
          <div className="landing-section-header">
            <p className="landing-section-label">{t('pricing.label')}</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-5xl">
              {t('pricing.title')}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-400 sm:text-base">
              {t('pricing.subtitle')}
            </p>
          </div>

          {showBillingToggle && (
            <div className="mt-8 flex justify-center">
              <BillingPeriodToggle value={billingPeriod} onChange={setBillingPeriod} />
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-20">
              <Spinner className="h-8 w-8" />
            </div>
          ) : plans && plans.length > 0 ? (
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:items-center">
              {plans.map((plan, i) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  locale={locale}
                  billingPeriod={billingPeriod}
                  highlighted={i === highlightIndex}
                  variant="landing"
                />
              ))}
            </div>
          ) : (
            <p className="mt-16 text-center text-sm text-slate-400">{t('pricing.empty')}</p>
          )}

          <div className="mt-14 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-slate-400">{t('pricing.ctaHint')}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="landing-primary-btn group inline-flex h-12 items-center gap-2 rounded-full px-8 text-sm font-semibold"
              >
                {t('auth.login')}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="site-header-nav-link inline-flex h-12 items-center gap-2 px-6 text-sm"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('pricing.backHome')}
              </button>
            </div>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
