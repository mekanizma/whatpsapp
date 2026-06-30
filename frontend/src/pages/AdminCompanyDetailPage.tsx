/**
 * Super admin — şirket detay ve yönetim
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Save, RotateCcw, Smartphone, Users, MessageSquare, Zap, Ticket,
} from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import {
  Button, Input, Label, Card, CardContent, CardHeader, CardTitle,
  Spinner, Badge,
} from '@/components/ui';
import type { CompanyDetail } from '@/types';
import { cn } from '@/lib/utils';

const PLAN_VALUES = ['starter', 'business', 'enterprise'];
const STATUS_VALUES = ['trial', 'active', 'suspended', 'inactive', 'cancelled'];

export function AdminCompanyDetailPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'genel' | 'abonelik' | 'kullanicilar'>('genel');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-company', id],
    queryFn: () => api.get<CompanyDetail>(`/admin/companies/${id}`),
    enabled: !!id,
  });

  const [form, setForm] = useState<Record<string, string>>({});

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, string>) => api.put(`/admin/companies/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-company', id] }),
  });

  const subMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/admin/companies/${id}/subscription`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-company', id] }),
  });

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

  const { company, subscription, whatsapp, users, staff_count, stats } = data;
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
    { id: 'abonelik' as const, labelKey: 'admin.companyDetail.tabs.subscription' },
    { id: 'kullanicilar' as const, labelKey: 'admin.companyDetail.tabs.users' },
  ];

  const planLabel = t(`common.plans.${company.subscription_plan}`, { defaultValue: company.subscription_plan });

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title={t('admin.companyDetail.messages')} value={stats.total_messages} icon={MessageSquare} color="text-blue-600" bgColor="bg-blue-50" />
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

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
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
        <Card>
          <CardHeader><CardTitle>{t('admin.companyDetail.companyInfo')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('admin.companyDetail.companyName')}</Label>
                <Input value={companyForm.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
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
      )}

      {tab === 'abonelik' && subscription && (
        <Card>
          <CardHeader><CardTitle>{t('admin.companyDetail.subscription')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('admin.companyDetail.package')}</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  defaultValue={subscription.plan?.plan_type || company.subscription_plan}
                  onChange={(e) => subMutation.mutate({ plan_type: e.target.value })}
                >
                  {PLAN_VALUES.map((value) => (
                    <option key={value} value={value}>{t(`common.plans.${value}`)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('admin.companyDetail.subStatus')}</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  defaultValue={subscription.status}
                  onChange={(e) => subMutation.mutate({ status: e.target.value })}
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
      )}

      {tab === 'kullanicilar' && (
        <Card>
          <CardHeader><CardTitle>{t('admin.companyDetail.users')}</CardTitle></CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <p className="text-sm text-slate-500">{t('admin.companyDetail.noUsers')}</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {users.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="font-medium">{u.full_name}</p>
                      <p className="text-xs text-slate-500">
                        {t(`common.roles.${u.role}`, { defaultValue: u.role })} · {new Date(u.created_at).toLocaleDateString(locale)}
                      </p>
                    </div>
                    <Badge variant={u.is_active ? 'success' : 'warning'}>
                      {u.is_active ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
