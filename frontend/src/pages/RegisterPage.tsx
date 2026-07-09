/**
 * Kayıt sayfası — işletme başvuru formu (şifresiz)
 */

import { useState, useEffect, useCallback, FormEvent, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Building2, User, Phone, Mail, ShieldCheck, RefreshCw } from 'lucide-react';
import { WaaiLogo } from '@/components/WaaiLogo';
import { AuthPageLayout } from '@/components/auth/AuthPageLayout';
import { AuthFormShell } from '@/components/auth/AuthFormShell';
import { PlanPicker } from '@/components/PlanPicker';
import { Button, Input, Label, Spinner } from '@/components/ui';
import { api } from '@/services/api';
import { isHighlightedPlan } from '@/lib/plan-format';
import type { BillingPeriod } from '@/lib/plan-format';
import type { SubscriptionPlan } from '@/types';
import { CompanyCategorySelect } from '@/components/CompanyCategorySelect';
import { DEFAULT_COMPANY_CATEGORY } from '@/lib/company-categories';

interface Captcha {
  token: string;
  question: string;
}

export function RegisterPage() {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [category, setCategory] = useState<string>(DEFAULT_COMPANY_CATEGORY);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['public-plans'],
    queryFn: () => api.get<SubscriptionPlan[]>('/public/plans'),
    staleTime: 5 * 60 * 1000,
  });

  const defaultPlanId = useMemo(() => {
    if (!plans?.length) return null;
    const highlighted = plans.find((plan) => isHighlightedPlan(plan, plans));
    return highlighted?.id || plans[0]?.id || null;
  }, [plans]);

  useEffect(() => {
    if (defaultPlanId && !selectedPlanId) {
      setSelectedPlanId(defaultPlanId);
    }
  }, [defaultPlanId, selectedPlanId]);

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    setCaptchaAnswer('');
    try {
      const data = await api.get<Captcha>('/public/signup-captcha');
      setCaptcha(data);
    } catch {
      setCaptcha(null);
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCaptcha();
  }, [loadCaptcha]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!captcha) {
      setError(t('auth.captchaUnavailable'));
      void loadCaptcha();
      return;
    }
    if (!captchaAnswer.trim()) {
      setError(t('auth.captchaRequired'));
      return;
    }
    if (!selectedPlanId) {
      setError(t('auth.planRequired'));
      return;
    }

    setLoading(true);
    try {
      await api.post('/public/signup-applications', {
        company_name: companyName,
        category,
        full_name: fullName,
        phone,
        email,
        subscription_plan_id: selectedPlanId,
        billing_period: billingPeriod,
        captcha_token: captcha.token,
        captcha_answer: captchaAnswer.trim(),
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.applicationFailed'));
      void loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout variant="customer">
      <AuthFormShell
        icon={<WaaiLogo className="auth-form-logo" />}
        title={t('auth.applicationForm')}
        subtitle={t('auth.applicationSubtitle')}
        onSubmit={success ? undefined : handleSubmit}
        accent="teal"
        footer={
          <p className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-center text-sm">
            <span>{t('auth.hasAccount')}</span>
            <Link to="/login" className="font-semibold text-teal-300 hover:text-teal-200 hover:underline">
              {t('auth.login')}
            </Link>
          </p>
        }
      >
        {success ? (
          <div className="animate-fade-up flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="text-sm font-medium text-emerald-800">{t('auth.applicationSuccess')}</p>
            <Link
              to="/login"
              className="mt-2 text-sm font-semibold text-teal-600 hover:text-teal-500 hover:underline"
            >
              {t('auth.login')}
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="animate-fade-up rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="companyName">{t('auth.companyName')}</Label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={t('auth.companyNamePlaceholder')}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">{t('auth.category')}</Label>
              <CompanyCategorySelect
                id="category"
                value={category}
                onChange={setCategory}
                className="rounded-md border-slate-300 bg-slate-50 focus:ring-primary/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan-picker">{t('auth.selectPlan')}</Label>
              <PlanPicker
                id="plan-picker"
                plans={plans ?? []}
                selectedId={selectedPlanId}
                onSelect={setSelectedPlanId}
                billingPeriod={billingPeriod}
                onBillingPeriodChange={setBillingPeriod}
                loading={plansLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">{t('auth.fullName')}</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('auth.fullNamePlaceholder')}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">{t('auth.phone')}</Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t('auth.phonePlaceholder')}
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('common.email')}</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('auth.emailPlaceholder')}
                    className="pl-9"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="captcha">{t('auth.captchaLabel')}</Label>
              <div className="flex items-stretch gap-2">
                <div className="flex min-w-[6.5rem] shrink-0 items-center justify-center gap-1 rounded-md border border-slate-300 bg-slate-100 px-3 font-mono text-base font-semibold tracking-wider text-slate-700 select-none">
                  {captchaLoading || !captcha ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <span>{captcha.question} =</span>
                  )}
                </div>
                <div className="relative flex-1">
                  <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="captcha"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    placeholder={t('auth.captchaPlaceholder')}
                    className="pl-9"
                    required
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void loadCaptcha()}
                  className="flex shrink-0 items-center justify-center rounded-md border border-slate-300 px-3 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                  aria-label={t('auth.captchaRefresh')}
                  title={t('auth.captchaRefresh')}
                >
                  <RefreshCw className={captchaLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                </button>
              </div>
              <p className="text-xs text-slate-500">{t('auth.captchaHint')}</p>
            </div>

            <Button
              type="submit"
              className="group w-full shadow-lg shadow-primary/20 transition hover:shadow-xl hover:shadow-primary/25"
              size="lg"
              disabled={loading || plansLoading || !selectedPlanId}
            >
              {loading ? (
                <Spinner />
              ) : (
                <>
                  {t('auth.submitApplication')}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </>
        )}
      </AuthFormShell>
    </AuthPageLayout>
  );
}
