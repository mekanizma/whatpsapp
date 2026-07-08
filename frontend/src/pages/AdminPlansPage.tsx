/**
 * Super admin — abonelik paketleri yönetimi
 */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Save, Pencil, X, Plus } from 'lucide-react';
import { api } from '@/services/api';
import { getErrorMessage } from '@/lib/errors';
import { PageHeader } from '@/components/PageHeader';
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
  Badge,
  Textarea,
} from '@/components/ui';
import type { SubscriptionPlan } from '@/types';
import { cn } from '@/lib/utils';
import { isDemoMode } from '@/lib/env';
import {
  PLAN_CURRENCIES,
  featuresToTextarea,
  parseLegacyDescriptionFeatures,
  parsePlanPriceInput,
  normalizePlanPrice,
  textareaToFeatures,
} from '@/lib/plan-format';
import { PlanCard } from '@/components/PlanCard';
import { BillingPeriodToggle } from '@/components/BillingPeriodToggle';
import { AdminAddonsSection } from '@/components/AdminAddonsSection';
import { planHasYearlyPrice } from '@/lib/plan-format';
import type { BillingPeriod } from '@/lib/plan-format';

interface PlanForm {
  plan_type?: string;
  name: string;
  description: string;
  features: string;
  message_limit: string;
  user_limit: string;
  price_monthly: string;
  price_yearly: string;
  currency: string;
  is_active: boolean;
  sync_subscriptions: boolean;
}

const EMPTY_CREATE_FORM: PlanForm = {
  plan_type: '',
  name: '',
  description: '',
  features: '',
  message_limit: '1000',
  user_limit: '1',
  price_monthly: '0',
  price_yearly: '',
  currency: 'TRY',
  is_active: true,
  sync_subscriptions: false,
};

function toForm(plan: SubscriptionPlan): PlanForm {
  const features =
    plan.features && plan.features.length > 0
      ? featuresToTextarea(plan.features)
      : featuresToTextarea(parseLegacyDescriptionFeatures(plan.description || ''));

  return {
    name: plan.name,
    description: plan.description || '',
    features,
    message_limit: String(plan.message_limit),
    user_limit: String(plan.user_limit),
    price_monthly: String(normalizePlanPrice(plan.price_monthly)),
    price_yearly:
      plan.price_yearly != null && normalizePlanPrice(plan.price_yearly) > 0
        ? String(normalizePlanPrice(plan.price_yearly))
        : '',
    currency: (plan.currency || 'TRY').toUpperCase(),
    is_active: plan.is_active,
    sync_subscriptions: false,
  };
}

export function AdminPlansPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [saveMsg, setSaveMsg] = useState<{ id: string; type: 'ok' | 'err'; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<PlanForm>(EMPTY_CREATE_FORM);
  const [createMsg, setCreateMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => api.get<SubscriptionPlan[]>('/admin/plans'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.put<SubscriptionPlan>(`/admin/plans/${id}`, body),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      queryClient.invalidateQueries({ queryKey: ['public-plans'] });
      setEditingId(null);
      setForm(null);
      setSaveMsg({ id: updated.id, type: 'ok', text: t('admin.plans.saved') });
    },
    onError: (err, variables) => {
      setSaveMsg({ id: variables.id, type: 'err', text: getErrorMessage(err) });
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<SubscriptionPlan>('/admin/plans', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      queryClient.invalidateQueries({ queryKey: ['public-plans'] });
      setCreateForm(EMPTY_CREATE_FORM);
      setShowCreate(false);
      setCreateMsg({ type: 'ok', text: t('admin.plans.created') });
    },
    onError: (err) => {
      setCreateMsg({ type: 'err', text: getErrorMessage(err) });
    },
  });

  const startEdit = (plan: SubscriptionPlan) => {
    setEditingId(plan.id);
    setForm(toForm(plan));
    setSaveMsg(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(null);
    setSaveMsg(null);
  };

  const handleSave = (planId: string) => {
    if (!form) return;
    setSaveMsg(null);

    const priceMonthly = parsePlanPriceInput(form.price_monthly);
    const priceYearly = form.price_yearly.trim() ? parsePlanPriceInput(form.price_yearly) : null;

    if (!Number.isFinite(priceMonthly) || priceMonthly < 0) {
      setSaveMsg({ id: planId, type: 'err', text: t('admin.plans.invalidPrice') });
      return;
    }
    if (priceYearly != null && (!Number.isFinite(priceYearly) || priceYearly < 0)) {
      setSaveMsg({ id: planId, type: 'err', text: t('admin.plans.invalidYearlyPrice') });
      return;
    }

    updateMutation.mutate({
      id: planId,
      body: {
        name: form.name.trim(),
        description: form.description.trim() || null,
        features: textareaToFeatures(form.features),
        message_limit: Number(form.message_limit),
        user_limit: Number(form.user_limit),
        price_monthly: priceMonthly,
        price_yearly: priceYearly,
        currency: form.currency,
        is_active: form.is_active,
        sync_subscriptions: form.sync_subscriptions,
      },
    });
  };

  const handleCreate = () => {
    setCreateMsg(null);

    const priceMonthly = parsePlanPriceInput(createForm.price_monthly);
    const priceYearly = createForm.price_yearly.trim()
      ? parsePlanPriceInput(createForm.price_yearly)
      : null;

    if (!createForm.plan_type?.trim()) {
      setCreateMsg({ type: 'err', text: t('admin.plans.planTypeRequired') });
      return;
    }
    if (!createForm.name.trim()) {
      setCreateMsg({ type: 'err', text: t('admin.plans.nameRequired') });
      return;
    }
    if (!Number.isFinite(priceMonthly) || priceMonthly < 0) {
      setCreateMsg({ type: 'err', text: t('admin.plans.invalidPrice') });
      return;
    }
    if (priceYearly != null && (!Number.isFinite(priceYearly) || priceYearly < 0)) {
      setCreateMsg({ type: 'err', text: t('admin.plans.invalidYearlyPrice') });
      return;
    }

    createMutation.mutate({
      plan_type: createForm.plan_type.trim(),
      name: createForm.name.trim(),
      description: createForm.description.trim() || null,
      features: textareaToFeatures(createForm.features),
      message_limit: Number(createForm.message_limit),
      user_limit: Number(createForm.user_limit),
      price_monthly: priceMonthly,
      price_yearly: priceYearly,
      currency: createForm.currency,
      is_active: createForm.is_active,
    });
  };

  const currencyLabel = (code: string) =>
    t(`admin.plans.currencies.${code}`, { defaultValue: code });

  const showBillingToggle = useMemo(
    () => (plans ?? []).some(planHasYearlyPrice),
    [plans]
  );

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title={t('admin.plans.title')}
        description={t('admin.plans.description')}
        action={
          !isDemoMode ? (
            <Button
              type="button"
              variant={showCreate ? 'outline' : 'default'}
              onClick={() => {
                setShowCreate((v) => !v);
                setCreateMsg(null);
              }}
            >
              {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showCreate ? t('common.cancel') : t('admin.plans.addNew')}
            </Button>
          ) : undefined
        }
      />

      {createMsg && !showCreate && (
        <div
          className={cn(
            'rounded-xl border px-4 py-3 text-sm',
            createMsg.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          )}
        >
          {createMsg.text}
        </div>
      )}

      {showCreate && !isDemoMode && (
        <Card className="overflow-hidden border-amber-200/80 shadow-sm">
          <CardHeader className="border-b border-amber-100 bg-amber-50/60 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plus className="h-5 w-5 text-amber-600" />
              {t('admin.plans.addTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('admin.plans.planType')}</Label>
                <Input
                  value={createForm.plan_type || ''}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      plan_type: e.target.value.toLowerCase().replace(/\s+/g, '_'),
                    })
                  }
                  placeholder={t('admin.plans.planTypePlaceholder')}
                />
                <p className="text-xs text-slate-500">{t('admin.plans.planTypeHint')}</p>
              </div>
              <div className="space-y-2">
                <Label>{t('admin.plans.name')}</Label>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder={t('admin.plans.namePlaceholder')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('admin.plans.fieldDescription')}</Label>
              <Input
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                placeholder={t('admin.plans.descriptionPlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('admin.plans.features')}</Label>
              <Textarea
                value={createForm.features}
                onChange={(e) => setCreateForm({ ...createForm, features: e.target.value })}
                rows={5}
                placeholder={t('admin.plans.featuresPlaceholder')}
                className="min-h-[7rem] resize-y font-mono text-sm"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('admin.plans.messageLimit')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={createForm.message_limit}
                  onChange={(e) => setCreateForm({ ...createForm, message_limit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.plans.userLimit')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={createForm.user_limit}
                  onChange={(e) => setCreateForm({ ...createForm, user_limit: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>{t('admin.plans.currency')}</Label>
                <select
                  value={createForm.currency}
                  onChange={(e) => setCreateForm({ ...createForm, currency: e.target.value })}
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  {PLAN_CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {currencyLabel(code)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('admin.plans.priceMonthly')}</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={createForm.price_monthly}
                  onChange={(e) => setCreateForm({ ...createForm, price_monthly: e.target.value })}
                  placeholder={t('admin.plans.priceInputPlaceholder')}
                />
              </div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                <Label>{t('admin.plans.priceYearly')}</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={createForm.price_yearly}
                  onChange={(e) => setCreateForm({ ...createForm, price_yearly: e.target.value })}
                  placeholder={t('admin.plans.priceYearlyPlaceholder')}
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300"
                checked={createForm.is_active}
                onChange={(e) => setCreateForm({ ...createForm, is_active: e.target.checked })}
              />
              <span className="text-sm text-slate-700">{t('admin.plans.activeHint')}</span>
            </label>

            {createMsg && (
              <p className={createMsg.type === 'ok' ? 'text-sm text-emerald-600' : 'text-sm text-rose-600'}>
                {createMsg.text}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleCreate}
                disabled={createMutation.isPending || !createForm.name.trim() || !createForm.plan_type?.trim()}
              >
                {createMutation.isPending ? <Spinner /> : <Plus className="h-4 w-4" />}
                {t('admin.plans.create')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreate(false);
                  setCreateForm(EMPTY_CREATE_FORM);
                  setCreateMsg(null);
                }}
                disabled={createMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isDemoMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('admin.plans.demoHint')}
        </div>
      )}

      {showBillingToggle && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">{t('subscription.billingPeriodHint')}</p>
          <BillingPeriodToggle value={billingPeriod} onChange={setBillingPeriod} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {plans?.map((plan) => {
          const isEditing = editingId === plan.id;
          const planLabel = t(`common.plans.${plan.plan_type}`, { defaultValue: plan.plan_type });

          return (
            <Card
              key={plan.id}
              className={cn(
                'overflow-hidden transition-shadow',
                isEditing && 'ring-2 ring-amber-400/60 shadow-md'
              )}
            >
              <CardHeader className="space-y-3 border-b border-slate-100 bg-slate-50/80 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="info">{planLabel}</Badge>
                      <Badge variant={plan.is_active ? 'success' : 'warning'}>
                        {plan.is_active ? t('admin.plans.active') : t('admin.plans.inactive')}
                      </Badge>
                    </div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <CreditCard className="h-5 w-5 shrink-0 text-amber-500" />
                      <span className="truncate">{isEditing ? form?.name : plan.name}</span>
                    </CardTitle>
                  </div>
                  {!isEditing && !isDemoMode && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => startEdit(plan)}
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="hidden sm:inline">{t('common.edit')}</span>
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4 p-4 sm:p-5">
                {isEditing && form ? (
                  <>
                    <div className="space-y-2">
                      <Label>{t('admin.plans.name')}</Label>
                      <Input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('admin.plans.fieldDescription')}</Label>
                      <Input
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        placeholder={t('admin.plans.descriptionPlaceholder')}
                      />
                      <p className="text-xs text-slate-500">{t('admin.plans.descriptionHint')}</p>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('admin.plans.features')}</Label>
                      <Textarea
                        value={form.features}
                        onChange={(e) => setForm({ ...form, features: e.target.value })}
                        rows={6}
                        placeholder={t('admin.plans.featuresPlaceholder')}
                        className="min-h-[8rem] resize-y font-mono text-sm"
                      />
                      <p className="text-xs text-slate-500">{t('admin.plans.featuresHint')}</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>{t('admin.plans.messageLimit')}</Label>
                        <Input
                          type="number"
                          min={1}
                          value={form.message_limit}
                          onChange={(e) => setForm({ ...form, message_limit: e.target.value })}
                        />
                        <p className="text-xs text-slate-500">{t('admin.plans.messageLimitHint')}</p>
                      </div>
                      <div className="space-y-2">
                        <Label>{t('admin.plans.userLimit')}</Label>
                        <Input
                          type="number"
                          min={1}
                          value={form.user_limit}
                          onChange={(e) => setForm({ ...form, user_limit: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                      <p className="text-sm font-semibold text-slate-800">
                        {t('admin.plans.monthlyBillingSection')}
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>{t('admin.plans.currency')}</Label>
                          <select
                            value={form.currency}
                            onChange={(e) => setForm({ ...form, currency: e.target.value })}
                            className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                          >
                            {PLAN_CURRENCIES.map((code) => (
                              <option key={code} value={code}>
                                {currencyLabel(code)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label>{t('admin.plans.priceMonthly')}</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={form.price_monthly}
                            onChange={(e) => setForm({ ...form, price_monthly: e.target.value })}
                            placeholder={t('admin.plans.priceInputPlaceholder')}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                      <p className="text-sm font-semibold text-slate-800">
                        {t('admin.plans.yearlyBillingSection')}
                      </p>
                      <div className="space-y-2">
                        <Label>{t('admin.plans.priceYearly')}</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={form.price_yearly}
                          onChange={(e) => setForm({ ...form, price_yearly: e.target.value })}
                          placeholder={t('admin.plans.priceYearlyPlaceholder')}
                        />
                        <p className="text-xs text-slate-500">{t('admin.plans.priceYearlyHint')}</p>
                      </div>
                    </div>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300"
                        checked={form.is_active}
                        onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      />
                      <span className="text-sm text-slate-700">{t('admin.plans.activeHint')}</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-dashed border-amber-200 bg-amber-50/60 p-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-amber-300"
                        checked={form.sync_subscriptions}
                        onChange={(e) => setForm({ ...form, sync_subscriptions: e.target.checked })}
                      />
                      <span className="text-sm text-amber-900">{t('admin.plans.syncHint')}</span>
                    </label>
                    {saveMsg?.id === plan.id && (
                      <p className={saveMsg.type === 'ok' ? 'text-sm text-emerald-600' : 'text-sm text-rose-600'}>
                        {saveMsg.text}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        className="flex-1 sm:flex-none"
                        onClick={() => handleSave(plan.id)}
                        disabled={updateMutation.isPending || !form.name.trim()}
                      >
                        {updateMutation.isPending ? <Spinner /> : <Save className="h-4 w-4" />}
                        {t('common.save')}
                      </Button>
                      <Button variant="outline" onClick={cancelEdit} disabled={updateMutation.isPending}>
                        <X className="h-4 w-4" />
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <PlanCard plan={plan} locale={locale} billingPeriod={billingPeriod} embedded />
                    {saveMsg?.id === plan.id && saveMsg.type === 'ok' && (
                      <p className="text-sm text-emerald-600">{saveMsg.text}</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {(!plans || plans.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            {t('admin.plans.empty')}
          </CardContent>
        </Card>
      )}

      <AdminAddonsSection />
    </div>
  );
}
