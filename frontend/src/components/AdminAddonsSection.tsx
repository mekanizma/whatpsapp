/**
 * Admin — ek AI görüşme paketleri yönetimi
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Save, Pencil, X } from 'lucide-react';
import { api } from '@/services/api';
import { getErrorMessage } from '@/lib/errors';
import {
  Button, Input, Label, Card, CardContent, CardHeader, CardTitle, Spinner, Badge,
} from '@/components/ui';
import type { AiConversationAddon } from '@/types';
import { cn } from '@/lib/utils';
import { isDemoMode } from '@/lib/env';
import { PLAN_CURRENCIES, parsePlanPriceInput, formatPlanPrice } from '@/lib/plan-format';

interface AddonForm {
  name: string;
  conversation_count: string;
  price: string;
  currency: string;
  is_active: boolean;
  sort_order: string;
}

function toAddonForm(addon: AiConversationAddon): AddonForm {
  return {
    name: addon.name,
    conversation_count: String(addon.conversation_count),
    price: String(addon.price),
    currency: (addon.currency || 'TRY').toUpperCase(),
    is_active: addon.is_active,
    sort_order: String(addon.sort_order),
  };
}

export function AdminAddonsSection() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddonForm | null>(null);
  const [saveMsg, setSaveMsg] = useState<{ id: string; type: 'ok' | 'err'; text: string } | null>(null);

  const { data: addons, isLoading } = useQuery({
    queryKey: ['admin-addons'],
    queryFn: () => api.get<AiConversationAddon[]>('/admin/addons'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.put<AiConversationAddon>(`/admin/addons/${id}`, body),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['admin-addons'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-addons'] });
      setEditingId(null);
      setForm(null);
      setSaveMsg({ id: updated.id, type: 'ok', text: t('admin.plans.addonSaved') });
    },
    onError: (err, variables) => {
      setSaveMsg({ id: variables.id, type: 'err', text: getErrorMessage(err) });
    },
  });

  const startEdit = (addon: AiConversationAddon) => {
    setEditingId(addon.id);
    setForm(toAddonForm(addon));
    setSaveMsg(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(null);
    setSaveMsg(null);
  };

  const handleSave = (addonId: string) => {
    if (!form) return;
    const price = parsePlanPriceInput(form.price);
    const count = Number(form.conversation_count);
    if (!form.name.trim() || !Number.isFinite(count) || count < 1 || !Number.isFinite(price)) {
      setSaveMsg({ id: addonId, type: 'err', text: t('admin.plans.addonInvalid') });
      return;
    }
    setSaveMsg(null);
    updateMutation.mutate({
      id: addonId,
      body: {
        name: form.name.trim(),
        conversation_count: count,
        price,
        currency: form.currency,
        is_active: form.is_active,
        sort_order: Number(form.sort_order) || 0,
      },
    });
  };

  const currencyLabel = (code: string) =>
    t(`admin.plans.currencies.${code}`, { defaultValue: code });

  return (
    <div className="space-y-4 border-t border-slate-200 pt-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t('admin.plans.addonsTitle')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('admin.plans.addonsDescription')}</p>
      </div>

      {isDemoMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('admin.plans.addonDemoHint')}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center p-8"><Spinner className="h-8 w-8" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {addons?.map((addon) => {
            const isEditing = editingId === addon.id;
            return (
              <Card
                key={addon.id}
                className={cn('overflow-hidden', isEditing && 'ring-2 ring-amber-400/60')}
              >
                <CardHeader className="border-b border-slate-100 bg-slate-50/80 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MessageSquare className="h-5 w-5 text-amber-500" />
                      <span className="truncate">{isEditing ? form?.name : addon.name}</span>
                    </CardTitle>
                    {!isEditing && !isDemoMode && (
                      <Button variant="outline" size="sm" onClick={() => startEdit(addon)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Badge variant={addon.is_active ? 'success' : 'warning'} className="w-fit">
                    {addon.is_active ? t('admin.plans.active') : t('admin.plans.inactive')}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4 p-4">
                  {isEditing && form ? (
                    <>
                      <div className="space-y-2">
                        <Label>{t('admin.plans.addonName')}</Label>
                        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>{t('admin.plans.addonCount')}</Label>
                          <Input
                            type="number"
                            min={1}
                            value={form.conversation_count}
                            onChange={(e) => setForm({ ...form, conversation_count: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t('admin.plans.addonSort')}</Label>
                          <Input
                            type="number"
                            value={form.sort_order}
                            onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>{t('admin.plans.currency')}</Label>
                          <select
                            value={form.currency}
                            onChange={(e) => setForm({ ...form, currency: e.target.value })}
                            className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                          >
                            {PLAN_CURRENCIES.map((code) => (
                              <option key={code} value={code}>{currencyLabel(code)}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label>{t('admin.plans.addonPrice')}</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={form.price}
                            onChange={(e) => setForm({ ...form, price: e.target.value })}
                          />
                        </div>
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.is_active}
                          onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                        />
                        {t('admin.plans.activeHint')}
                      </label>
                      {saveMsg?.id === addon.id && (
                        <p className={saveMsg.type === 'ok' ? 'text-sm text-emerald-600' : 'text-sm text-rose-600'}>
                          {saveMsg.text}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button onClick={() => handleSave(addon.id)} disabled={updateMutation.isPending}>
                          {updateMutation.isPending ? <Spinner /> : <Save className="h-4 w-4" />}
                          {t('common.save')}
                        </Button>
                        <Button variant="outline" onClick={cancelEdit} disabled={updateMutation.isPending}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <p className="text-2xl font-bold text-slate-900">
                        {formatPlanPrice(addon.price, addon.currency, locale)}
                      </p>
                      <p className="text-slate-600">
                        {t('admin.plans.addonCountDisplay', {
                          count: addon.conversation_count.toLocaleString(locale),
                        })}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
