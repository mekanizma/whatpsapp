/**
 * Super admin — şirket listesi ve oluşturma
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ChevronRight, Pause, Play, Smartphone } from 'lucide-react';
import { api } from '@/services/api';
import { CompanyPlanFeatures } from '@/components/CompanyPlanFeatures';
import { PageHeader } from '@/components/PageHeader';
import {
  Button, Input, Label, Card, CardContent, CardHeader, CardTitle,
  Spinner, Badge,
} from '@/components/ui';
import type { AdminCompany, SubscriptionPlan } from '@/types';
import { localizePlan } from '@/lib/plan-localize';
import { cn } from '@/lib/utils';

const CATEGORY_VALUES = [
  'universite', 'klinik', 'dis_hekimi', 'guzellik_merkezi', 'emlak',
  'rent_a_car', 'otel', 'restoran', 'kurs', 'diger',
];

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-teal-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{used.toLocaleString()} / {limit.toLocaleString()}</span>
        <span>%{pct}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function formatAdminUserError(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Bilinmeyen hata';
}

export function AdminCompaniesPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    company_name: '',
    category: 'diger',
    email: '',
    phone: '',
    subscription_plan: 'starter',
    billing_period: 'monthly' as 'monthly' | 'yearly',
    admin_full_name: '',
    admin_email: '',
    admin_password: '',
  });
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-companies', search],
    queryFn: () => api.getWithMeta<AdminCompany[]>(`/admin/companies?search=${encodeURIComponent(search)}`),
  });

  const { data: plans } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => api.get<SubscriptionPlan[]>('/admin/plans'),
  });

  const activePlans = (plans || []).filter((p) => p.is_active);
  const selectedPlan = activePlans.find((p) => p.plan_type === form.subscription_plan)
    || activePlans[0];

  const [adminUserWarning, setAdminUserWarning] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api.post<{ admin_user_error?: string | Record<string, unknown> | null }>('/admin/companies', body),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });

      if (result?.admin_user_error) {
        setAdminUserWarning(formatAdminUserError(result.admin_user_error));
        return;
      }

      setAdminUserWarning(null);
      setShowForm(false);
      setForm({
        company_name: '', category: 'diger', email: '', phone: '',
        subscription_plan: activePlans[0]?.plan_type || 'starter',
        billing_period: 'monthly',
        admin_full_name: '', admin_email: '', admin_password: '',
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/admin/companies/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-companies'] }),
  });

  const companies = data?.data || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.companies.title')}
        description={t('admin.companies.description')}
        action={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> {t('admin.companies.newCompany')}
          </Button>
        }
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder={t('admin.companies.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.companies.createTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>{t('admin.companies.companyName')} *</Label>
                <Input
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  placeholder={t('admin.companies.companyNamePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.companies.category')}</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORY_VALUES.map((value) => (
                    <option key={value} value={value}>{t(`common.categories.${value}`)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('admin.companies.plan')}</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  value={form.subscription_plan}
                  onChange={(e) => setForm({ ...form, subscription_plan: e.target.value })}
                >
                  {activePlans.map((plan) => {
                    const label = localizePlan(plan, i18n.language).name;
                    return (
                      <option key={plan.id} value={plan.plan_type}>{label}</option>
                    );
                  })}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('admin.companyDetail.billingPeriod')}</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  value={form.billing_period}
                  onChange={(e) => setForm({ ...form, billing_period: e.target.value as 'monthly' | 'yearly' })}
                >
                  <option value="monthly">{t('admin.companyDetail.invoiceMonthly')}</option>
                  <option value="yearly">{t('admin.companyDetail.invoiceYearly')}</option>
                </select>
              </div>
              {selectedPlan && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t('admin.companies.planFeatures')}</Label>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                    <CompanyPlanFeatures
                      planType={selectedPlan.plan_type}
                      planName={selectedPlan.name}
                      description={selectedPlan.description}
                      features={selectedPlan.features}
                      messageLimit={selectedPlan.message_limit}
                      userLimit={selectedPlan.user_limit}
                      compact
                    />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>{t('admin.companies.companyEmail')}</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.companies.phone')}</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-700">{t('admin.companies.adminOptional')}</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>{t('auth.fullName')}</Label>
                  <Input value={form.admin_full_name} onChange={(e) => setForm({ ...form, admin_full_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.companies.loginEmail')}</Label>
                  <Input type="email" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('common.password')}</Label>
                  <Input type="password" value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} minLength={6} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  if (form.admin_email && form.admin_password && form.admin_password.length < 6) {
                    setAdminUserWarning(t('admin.companies.passwordTooShort'));
                    return;
                  }
                  setAdminUserWarning(null);
                  createMutation.mutate(form);
                }}
                disabled={!form.company_name.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? <Spinner /> : t('admin.companies.create')}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
              {createMutation.isError && (
                <p className="w-full text-sm text-rose-600">{(createMutation.error as Error).message}</p>
              )}
              {adminUserWarning && (
                <p className="w-full rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                  {t('admin.companies.adminUserWarning', { error: adminUserWarning })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner className="h-8 w-8" /></div>
      ) : companies.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            {search ? t('admin.companies.noResults') : t('admin.companies.empty')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {companies.map((company) => {
            const sub = company.subscription;
            const wa = company.whatsapp;
            const isSuspended = company.status === 'suspended';

            return (
              <Card key={company.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/admin/companies/${company.id}`} className="text-lg font-semibold text-slate-900 hover:text-teal-600">
                          {company.company_name}
                        </Link>
                        <Badge variant="info">{t(`common.categories.${company.category}`, { defaultValue: company.category })}</Badge>
                        <Badge variant={company.status === 'active' || company.status === 'trial' ? 'success' : 'warning'}>
                          {t(`common.status.${company.status}`, { defaultValue: company.status })}
                        </Badge>
                        <Badge>{t(`common.plans.${company.subscription_plan}`, { defaultValue: company.subscription_plan })}</Badge>
                      </div>
                      <p className="text-sm text-slate-500">{company.email || '—'} · {company.phone || '—'}</p>
                      {company.plan && (
                        <CompanyPlanFeatures
                          planType={company.plan.plan_type}
                          planName={company.plan.name}
                          description={company.plan.description}
                          features={company.plan.features}
                          messageLimit={company.plan.messages_limit}
                          userLimit={company.plan.users_limit}
                          compact
                          className="max-w-2xl"
                        />
                      )}
                      {sub && <div className="max-w-xs"><UsageBar used={sub.messages_used} limit={sub.messages_limit} /></div>}
                      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>{t('admin.companies.conversationCount', { count: company.conversation_count ?? 0 })}</span>
                        <span>{t('admin.companies.aiTokens', { count: (company.ai_tokens_month ?? 0).toLocaleString(locale) })}</span>
                        <span className="flex items-center gap-1">
                          <Smartphone className="h-3 w-3" />
                          {t('whatsapp.shortLabel')}: {wa?.status === 'connected' ? wa.phone_number || t('common.connected') : t('common.notConnected')}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => statusMutation.mutate({ id: company.id, status: isSuspended ? 'active' : 'suspended' })}
                        disabled={statusMutation.isPending}
                      >
                        {isSuspended ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                        {isSuspended ? t('admin.companies.activate') : t('admin.companies.suspend')}
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/admin/companies/${company.id}`}>
                          {t('admin.companies.detail')} <ChevronRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
