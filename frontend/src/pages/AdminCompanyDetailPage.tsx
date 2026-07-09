/**
 * Super admin — şirket detay ve yönetim
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Save, RotateCcw, Smartphone, Users, MessageSquare, Zap, Ticket, FileDown, Lock, ExternalLink,
} from 'lucide-react';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { PageHeader } from '@/components/PageHeader';
import { ResetPasswordForm } from '@/components/ResetPasswordForm';
import { StatCard } from '@/components/StatCard';
import {
  Button, Input, Label, Card, CardContent, CardHeader, CardTitle,
  Spinner, Badge,
} from '@/components/ui';
import { AdminCompanyNotes } from '@/components/admin/AdminCompanyNotes';
import { AdminCompanyLoginAccount } from '@/components/admin/AdminCompanyLoginAccount';
import { CompanyPlanFeatures } from '@/components/CompanyPlanFeatures';
import type { CompanyDetail, SubscriptionPlan } from '@/types';
import { localizePlan } from '@/lib/plan-localize';
import { cn } from '@/lib/utils';
import { CompanyCategorySelect } from '@/components/CompanyCategorySelect';

const STATUS_VALUES = ['trial', 'active', 'suspended', 'inactive', 'cancelled'];

export function AdminCompanyDetailPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const startImpersonation = useAuthStore((s) => s.startImpersonation);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'genel' | 'notlar' | 'abonelik' | 'kullanicilar'>('genel');
  const [impersonateLoading, setImpersonateLoading] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);
  const [invoicePeriod, setInvoicePeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [setupFee, setSetupFee] = useState('');
  const [setupFeeDescription, setSetupFeeDescription] = useState('');
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [resetProfileId, setResetProfileId] = useState<string | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [subMsg, setSubMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedBillingPeriod, setSelectedBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedSubStatus, setSelectedSubStatus] = useState('trial');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-company', id],
    queryFn: () => api.get<CompanyDetail>(`/admin/companies/${id}`),
    enabled: !!id,
  });

  const { data: plans } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => api.get<SubscriptionPlan[]>('/admin/plans'),
  });
  const activePlans = (plans || []).filter((p) => p.is_active);

  const [form, setForm] = useState<Record<string, string>>({});

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, string>) => api.put(`/admin/companies/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-company', id] }),
  });

  const subMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/admin/companies/${id}/subscription`, body),
    onSuccess: () => {
      setSubMsg({ type: 'ok', text: t('admin.companyDetail.subscriptionSaved') });
      queryClient.invalidateQueries({ queryKey: ['admin-company', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
    },
    onError: (err: Error) => {
      setSubMsg({ type: 'err', text: err.message });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: ({ profileId, password }: { profileId: string; password: string }) =>
      api.patch(`/admin/users/${profileId}/password`, { password }),
    onSuccess: () => {
      setPasswordMsg({ type: 'ok', text: t('admin.users.passwordSaved') });
      setResetProfileId(null);
    },
    onError: (err: Error) => {
      setPasswordMsg({ type: 'err', text: err.message });
    },
  });

  useEffect(() => {
    if (!data?.subscription) return;
    const currentPlanType = data.subscription.plan?.plan_type || data.company.subscription_plan;
    const matchedPlan =
      (plans || []).find((p) => p.id === data.subscription?.plan?.id) ||
      (plans || []).find((p) => p.plan_type === currentPlanType);
    setSelectedPlanId(matchedPlan?.id || '');
    setSelectedBillingPeriod(data.subscription.billing_period || 'monthly');
    setSelectedSubStatus(data.subscription.status || 'trial');
    if (data.subscription.billing_period) {
      setInvoicePeriod(data.subscription.billing_period);
    }
  }, [data, plans]);

  if (isLoading) {
    return <div className="flex justify-center p-12"><Spinner className="h-8 w-8" /></div>;
  }

  if (error || !data) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-rose-600">{t('admin.companyDetail.notFound')}</p>
        <Button variant="outline" asChild>
          <Link to="/admin/companies"><ArrowLeft className="h-4 w-4" /> {t('common.back')}</Link>
        </Button>
      </div>
    );
  }

  const { company, subscription, whatsapp, users, staff_count, stats, plan } = data;
  const selectablePlans = (() => {
    const list = [...(plans || [])];
    const currentPlanType = subscription?.plan?.plan_type || company.subscription_plan;
    const currentPlan = list.find((p) => p.plan_type === currentPlanType);
    if (currentPlan && !list.some((p) => p.id === currentPlan.id)) {
      list.unshift(currentPlan);
    }
    return list.length ? list : activePlans;
  })();
  const companyForm = {
    company_name: form.company_name ?? company.company_name,
    category: form.category ?? company.category,
    email: form.email ?? company.email ?? '',
    phone: form.phone ?? company.phone ?? '',
    address: form.address ?? company.address ?? '',
    status: form.status ?? company.status,
  };

  const tabs = [
    { id: 'genel' as const, labelKey: 'admin.companyDetail.tabs.general' },
    { id: 'notlar' as const, labelKey: 'admin.companyDetail.tabs.notes' },
    { id: 'abonelik' as const, labelKey: 'admin.companyDetail.tabs.subscription' },
    { id: 'kullanicilar' as const, labelKey: 'admin.companyDetail.tabs.users' },
  ];

  const planLabel = plan?.name
    || localizePlan(
      {
        plan_type: company.subscription_plan,
        name: subscription?.plan?.name || company.subscription_plan,
        name_en: null,
      },
      i18n.language
    ).name;

  const handleDownloadInvoice = async () => {
    if (!id) return;
    setInvoiceError(null);
    setInvoiceLoading(true);
    try {
      const params = new URLSearchParams({ period: invoicePeriod });
      const fee = setupFee.trim() ? Number(setupFee.replace(',', '.')) : 0;
      if (fee > 0) {
        params.set('setupFee', String(fee));
        if (setupFeeDescription.trim()) {
          params.set('setupFeeDescription', setupFeeDescription.trim());
        }
      }
      await api.downloadBlob(`/admin/companies/${id}/invoice?${params.toString()}`);
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : t('admin.companyDetail.invoiceError'));
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleEnterPanel = async () => {
    if (!id) return;
    setImpersonateError(null);
    setImpersonateLoading(true);
    try {
      await startImpersonation(id);
      navigate('/panel/dashboard');
    } catch (err) {
      setImpersonateError(err instanceof Error ? err.message : t('admin.impersonation.error'));
    } finally {
      setImpersonateLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/companies"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <PageHeader
            title={company.company_name}
            description={t('admin.companyDetail.headerDesc', {
              id: company.id.slice(0, 8),
              plan: planLabel,
            })}
          />
        </div>
        <Button
          className="w-full min-h-[44px] sm:w-auto"
          disabled={impersonateLoading}
          onClick={handleEnterPanel}
        >
          {impersonateLoading ? <Spinner /> : <ExternalLink className="h-4 w-4" />}
          {t('admin.impersonation.enterPanel')}
        </Button>
      </div>
      {impersonateError && (
        <p className="text-sm text-rose-600">{impersonateError}</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title={t('admin.companyDetail.conversations')} value={stats.total_conversations} icon={MessageSquare} color="text-blue-600" bgColor="bg-blue-50" />
        <StatCard title={t('admin.companyDetail.aiResponse')} value={stats.ai_responses} icon={Zap} color="text-teal-600" bgColor="bg-teal-50" />
        <StatCard title={t('admin.companyDetail.transfer')} value={stats.transferred} icon={Ticket} color="text-amber-600" bgColor="bg-amber-50" />
        <StatCard title={t('admin.companyDetail.staff')} value={staff_count} icon={Users} color="text-violet-600" bgColor="bg-violet-50" />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Smartphone className="h-5 w-5 text-slate-400" />
          <span className="text-sm">
            {t('admin.companyDetail.whatsappLabel')}:{' '}
            <Badge variant={whatsapp?.status === 'connected' ? 'success' : 'warning'}>
              {whatsapp?.status === 'connected'
                ? whatsapp.phone_number || t('common.connected')
                : t('common.notConnected')}
            </Badge>
          </span>
          <span className="text-sm text-slate-500">
            {t('admin.companyDetail.aiTokensMonth')} {stats.ai_tokens_used.toLocaleString(locale)}
          </span>
        </CardContent>
      </Card>

      <div className="flex max-w-full gap-1 overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200 bg-white p-1">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => setTab(tabItem.id)}
            className={cn(
              'shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition',
              tab === tabItem.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
            )}
          >
            {t(tabItem.labelKey)}
          </button>
        ))}
      </div>

      {tab === 'genel' && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{t('admin.companyDetail.companyInfo')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('admin.companyDetail.companyName')}</Label>
                  <Input value={companyForm.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.companies.category')}</Label>
                  <CompanyCategorySelect
                    value={companyForm.category}
                    onChange={(category) => setForm({ ...form, category })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.companyDetail.status')}</Label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                    value={companyForm.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    {STATUS_VALUES.map((value) => (
                      <option key={value} value={value}>{t(`common.status.${value}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t('common.email')}</Label>
                  <Input type="email" value={companyForm.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.phone')}</Label>
                  <Input value={companyForm.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t('admin.companyDetail.address')}</Label>
                  <Input value={companyForm.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
              </div>
              <Button onClick={() => updateMutation.mutate(companyForm)} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Spinner /> : <><Save className="h-4 w-4" /> {t('common.save')}</>}
              </Button>
            </CardContent>
          </Card>

          {id && <AdminCompanyLoginAccount companyId={id} users={users} />}
        </div>
      )}

      {tab === 'notlar' && id && <AdminCompanyNotes companyId={id} />}

      {tab === 'abonelik' && subscription && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">{t('admin.companyDetail.invoiceCard')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">{t('admin.companyDetail.invoiceDesc')}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('admin.companyDetail.invoicePeriod')}</Label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                    value={invoicePeriod}
                    onChange={(e) => setInvoicePeriod(e.target.value as 'monthly' | 'yearly')}
                  >
                    <option value="monthly">{t('admin.companyDetail.invoiceMonthly')}</option>
                    <option value="yearly">{t('admin.companyDetail.invoiceYearly')}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.companyDetail.setupFee')}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0"
                    value={setupFee}
                    onChange={(e) => setSetupFee(e.target.value)}
                  />
                  <p className="text-xs text-slate-500">{t('admin.companyDetail.setupFeeHint')}</p>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t('admin.companyDetail.setupFeeDescription')}</Label>
                  <Input
                    placeholder={t('admin.companyDetail.setupFeeDescriptionPlaceholder')}
                    value={setupFeeDescription}
                    onChange={(e) => setSetupFeeDescription(e.target.value)}
                    disabled={!setupFee.trim()}
                  />
                </div>
              </div>
              <Button
                className="w-full sm:w-auto"
                onClick={handleDownloadInvoice}
                disabled={invoiceLoading}
              >
                {invoiceLoading ? <Spinner /> : <><FileDown className="h-4 w-4" /> {t('admin.companyDetail.downloadInvoice')}</>}
              </Button>
              {invoiceError && (
                <p className="text-sm text-rose-600">{invoiceError}</p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>{t('admin.companyDetail.subscription')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {subMsg && (
                <p className={cn('text-sm', subMsg.type === 'ok' ? 'text-emerald-600' : 'text-rose-600')}>
                  {subMsg.text}
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('admin.companyDetail.package')}</Label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                    value={selectedPlanId}
                    disabled={subMutation.isPending || selectablePlans.length === 0}
                    onChange={(e) => {
                      const nextPlanId = e.target.value;
                      setSelectedPlanId(nextPlanId);
                      setSubMsg(null);
                      subMutation.mutate({ plan_id: nextPlanId });
                    }}
                  >
                    {selectablePlans.map((item) => {
                      const label = localizePlan(item, i18n.language).name;
                      return (
                        <option key={item.id} value={item.id}>{label}</option>
                      );
                    })}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.companyDetail.billingPeriod')}</Label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                    value={selectedBillingPeriod}
                    disabled={subMutation.isPending}
                    onChange={(e) => {
                      const nextPeriod = e.target.value as 'monthly' | 'yearly';
                      setSelectedBillingPeriod(nextPeriod);
                      setSubMsg(null);
                      subMutation.mutate({ billing_period: nextPeriod });
                    }}
                  >
                    <option value="monthly">{t('admin.companyDetail.invoiceMonthly')}</option>
                    <option value="yearly">{t('admin.companyDetail.invoiceYearly')}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.companyDetail.subStatus')}</Label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                    value={selectedSubStatus}
                    disabled={subMutation.isPending}
                    onChange={(e) => {
                      setSelectedSubStatus(e.target.value);
                      setSubMsg(null);
                      subMutation.mutate({ status: e.target.value });
                    }}
                  >
                    {['trial', 'active', 'cancelled'].map((value) => (
                      <option key={value} value={value}>{t(`common.status.${value}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.companyDetail.messageLimit')}</Label>
                  <Input
                    type="number"
                    defaultValue={subscription.messages_limit}
                    onBlur={(e) => subMutation.mutate({ messages_limit: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.companyDetail.messagesUsed')}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      defaultValue={subscription.messages_used}
                      onBlur={(e) => subMutation.mutate({ messages_used: parseInt(e.target.value) || 0 })}
                    />
                    <Button variant="outline" onClick={() => subMutation.mutate({ messages_used: 0 })} disabled={subMutation.isPending}>
                      <RotateCcw className="h-4 w-4" /> {t('admin.companyDetail.reset')}
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-500">
                {t('admin.companyDetail.usageHint', {
                  usersLimit: subscription.users_limit,
                  apiCalls: stats.ai_api_calls,
                  cached: stats.ai_cached_hits,
                  skipped: stats.ai_skipped,
                })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t('admin.companyDetail.planFeaturesCard')}</CardTitle></CardHeader>
            <CardContent>
              <CompanyPlanFeatures
                planType={plan?.plan_type || subscription.plan?.plan_type || company.subscription_plan}
                planName={plan?.name || subscription.plan?.name}
                description={plan?.description || subscription.plan?.description}
                features={plan?.features || subscription.plan?.features}
                messageLimit={subscription.messages_limit}
                userLimit={subscription.users_limit}
              />
              <p className="mt-4 text-xs text-slate-500">{t('admin.companyDetail.planFeaturesHint')}</p>
            </CardContent>
          </Card>
          </div>
        </div>
      )}

      {tab === 'kullanicilar' && (
        <Card>
          <CardHeader><CardTitle>{t('admin.companyDetail.users')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {passwordMsg && (
              <p className={passwordMsg.type === 'ok' ? 'text-sm text-emerald-600' : 'text-sm text-red-600'}>
                {passwordMsg.text}
              </p>
            )}
            {users.length === 0 ? (
              <p className="text-sm text-slate-500">{t('admin.companyDetail.noUsers')}</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {users.map((u) => {
                  const isOpen = resetProfileId === u.id;
                  return (
                    <div key={u.id} className="py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-medium">{u.full_name}</p>
                          {u.email && <p className="text-sm text-slate-500">{u.email}</p>}
                          <p className="text-xs text-slate-500">
                            {t(`common.roles.${u.role}`, { defaultValue: u.role })} · {new Date(u.created_at).toLocaleDateString(locale)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={u.is_active ? 'success' : 'warning'}>
                            {u.is_active ? t('common.active') : t('common.inactive')}
                          </Badge>
                          <Button
                            size="sm"
                            variant={isOpen ? 'outline' : 'secondary'}
                            className="min-h-[44px]"
                            onClick={() => {
                              setPasswordMsg(null);
                              setResetProfileId(isOpen ? null : u.id);
                            }}
                          >
                            <Lock className="h-4 w-4" />
                            {isOpen ? t('common.cancel') : t('admin.users.resetPassword')}
                          </Button>
                        </div>
                      </div>
                      {isOpen && (
                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                          <p className="mb-3 text-sm text-slate-600">{t('admin.users.resetPasswordDesc')}</p>
                          <ResetPasswordForm
                            isPending={passwordMutation.isPending}
                            submitLabel={t('admin.users.savePassword')}
                            onSubmit={(password) => {
                              setPasswordMsg(null);
                              passwordMutation.mutate({ profileId: u.id, password });
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
