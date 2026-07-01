/**
 * Super admin — abonelik paketleri yönetimi
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Save, Pencil, X } from 'lucide-react';
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
  textareaToFeatures,
} from '@/lib/plan-format';
import { PlanCard } from '@/components/PlanCard';

interface PlanForm {
  name: string;
  description: string;
  features: string;
  message_limit: string;
  user_limit: string;
  price_monthly: string;
  currency: string;
  is_active: boolean;
  sync_subscriptions: boolean;
}

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
    price_monthly: String(plan.price_monthly),
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
  const [saveMsg, setSaveMsg] = useState<{ id: string; type: 'ok' | 'err'; text: string } | null>(null);

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
      setEditingId(null);
      setForm(null);
      setSaveMsg({ id: updated.id, type: 'ok', text: t('admin.plans.saved') });
    },
    onError: (err, variables) => {
      setSaveMsg({ id: variables.id, type: 'err', text: getErrorMessage(err) });
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
    updateMutation.mutate({
      id: planId,
      body: {
        name: form.name.trim(),
        description: form.description.trim() || null,
        features: textareaToFeatures(form.features),
        message_limit: Number(form.message_limit),
        user_limit: Number(form.user_limit),
        price_monthly: Number(form.price_monthly),
        currency: form.currency,
        is_active: form.is_active,
        sync_subscriptions: form.sync_subscriptions,
      },
    });
  };

  const currencyLabel = (code: string) =>
    t(`admin.plans.currencies.${code}`, { defaultValue: code });

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
      />

      {isDemoMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('admin.plans.demoHint')}
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
                          type="number"
                          min={0}
                          step="0.01"
                          value={form.price_monthly}
                          onChange={(e) => setForm({ ...form, price_monthly: e.target.value })}
                        />
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
                    <PlanCard plan={plan} locale={locale} embedded />
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
    </div>
  );
}
