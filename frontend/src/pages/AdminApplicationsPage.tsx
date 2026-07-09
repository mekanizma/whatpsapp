/**
 * Super admin — kayıt başvuruları
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList, Search, CheckCircle2, X, Phone, Mail, Building2, User, Package,
} from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import {
  Button, Input, Label, Textarea, Card, CardContent, CardHeader, CardTitle,
  Spinner, Badge,
} from '@/components/ui';
import { CompanyCategoryBadge, useCompanyCategoryLabel } from '@/components/CompanyCategoryBadge';
import type { PlatformStats, SignupApplication } from '@/types';
import { cn } from '@/lib/utils';
import { localizePlan } from '@/lib/plan-localize';
import { formatPlanPrice, resolvePlanDisplayPrice } from '@/lib/plan-format';

const STATUS_FILTERS = ['all', 'pending', 'reviewed', 'approved', 'rejected'] as const;
const statusBadge: Record<string, 'info' | 'warning' | 'success' | 'danger' | 'default'> = {
  pending: 'info',
  reviewed: 'warning',
  approved: 'success',
  rejected: 'danger',
};

export function AdminApplicationsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState('');

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get<PlatformStats>('/admin/stats'),
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-signup-applications', statusFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      const qs = params.toString();
      return api.getWithMeta<SignupApplication[]>(`/admin/signup-applications${qs ? `?${qs}` : ''}`);
    },
    refetchInterval: 30_000,
  });

  const applications = data?.data || [];
  const selected = applications.find((a) => a.id === selectedId) || null;
  const selectedCategoryLabel = useCompanyCategoryLabel(selected?.category);

  const [provisionMsg, setProvisionMsg] = useState<{ type: 'ok' | 'err'; text: string; companyId?: string } | null>(null);

  const updateMutation = useMutation({
    mutationFn: ({ id, status, admin_notes }: { id: string; status: string; admin_notes?: string }) =>
      api.patch<SignupApplication>(`/admin/signup-applications/${id}`, { status, admin_notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-signup-applications'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  const provisionMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<{ company_id: string; application: SignupApplication }>(
        `/admin/signup-applications/${id}/provision`,
        {}
      ),
    onSuccess: (data) => {
      setProvisionMsg({
        type: 'ok',
        text: t('admin.applications.createAccountSuccess'),
        companyId: data.company_id,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-signup-applications'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
    },
    onError: (err: Error) => {
      setProvisionMsg({ type: 'err', text: err.message });
    },
  });

  const pendingCount = stats?.signup_applications_pending ?? 0;

  const openDetail = (app: SignupApplication) => {
    setSelectedId(app.id);
    setAdminNotes(app.admin_notes || '');
    setProvisionMsg(null);
  };

  const handleStatusChange = (status: string) => {
    if (!selected) return;
    updateMutation.mutate({ id: selected.id, status, admin_notes: adminNotes });
  };

  const handleSaveNotes = () => {
    if (!selected) return;
    updateMutation.mutate({ id: selected.id, status: selected.status, admin_notes: adminNotes });
  };

  const selectedPlanLabel = (() => {
    if (!selected?.plan) return '—';
    const displayPlan = localizePlan(selected.plan, i18n.language);
    const { price, period } = resolvePlanDisplayPrice(
      selected.plan,
      selected.billing_period || 'monthly'
    );
    const formattedPrice = formatPlanPrice(
      price,
      selected.plan.currency || 'TRY',
      locale
    );
    const periodLabel =
      period === 'yearly' ? t('subscription.perYear') : t('subscription.perMonth');
    return `${displayPlan.name} · ${formattedPrice} ${periodLabel}`;
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.applications.title')}
        description={t('admin.applications.description')}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          title={t('admin.applications.stats.pending')}
          value={pendingCount}
          icon={ClipboardList}
          color="text-amber-600"
          bgColor="bg-amber-50"
        />
        <StatCard
          title={t('admin.applications.stats.total')}
          value={data?.pagination?.total ?? applications.length}
          icon={ClipboardList}
          color="text-slate-600"
          bgColor="bg-slate-50"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.applications.search')}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={statusFilter === key ? 'default' : 'outline'}
              onClick={() => setStatusFilter(key)}
            >
              {t(`admin.applications.filters.${key}`)}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : isError ? (
        <p className="text-sm text-red-600">{t('admin.applications.loadError')}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('admin.applications.listTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-0 sm:px-6 sm:pb-6">
              {applications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500 sm:px-0">
                  {t('admin.applications.empty')}
                </p>
              ) : (
                applications.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => openDetail(app)}
                    className={cn(
                      'w-full rounded-xl border px-4 py-3 text-left transition',
                      selectedId === app.id
                        ? 'border-teal-200 bg-teal-50/80'
                        : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{app.company_name}</p>
                        <p className="truncate text-xs text-slate-500">{app.full_name}</p>
                        <CompanyCategoryBadge category={app.category} className="mt-1" />
                      </div>
                      <Badge variant={statusBadge[app.status] || 'default'}>
                        {t(`admin.applications.status.${app.status}`)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(app.created_at).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('admin.applications.detailTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {!selected ? (
                <p className="py-12 text-center text-sm text-slate-500">
                  {t('admin.applications.selectHint')}
                </p>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusBadge[selected.status] || 'default'}>
                      {t(`admin.applications.status.${selected.status}`)}
                    </Badge>
                    {selected.whatsapp_sent && (
                      <Badge variant="success">{t('admin.applications.whatsappSent')}</Badge>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <InfoRow icon={Building2} label={t('auth.companyName')} value={selected.company_name} />
                    <InfoRow
                      icon={Building2}
                      label={t('auth.category')}
                      value={selectedCategoryLabel || '—'}
                    />
                    <InfoRow icon={User} label={t('auth.fullName')} value={selected.full_name} />
                    <InfoRow icon={Package} label={t('admin.applications.selectedPlan')} value={selectedPlanLabel} />
                    <InfoRow icon={Phone} label={t('auth.phone')} value={selected.phone || '—'} />
                    <InfoRow icon={Mail} label={t('common.email')} value={selected.email} className="sm:col-span-2" />
                  </div>

                  <p className="text-xs text-slate-400">
                    {t('admin.applications.submittedAt')}{' '}
                    {new Date(selected.created_at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>

                  <div className="space-y-2">
                    <Label htmlFor="adminNotes">{t('admin.applications.adminNotes')}</Label>
                    <Textarea
                      id="adminNotes"
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder={t('admin.applications.adminNotesPlaceholder')}
                      rows={3}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={updateMutation.isPending}
                      onClick={handleSaveNotes}
                    >
                      {t('admin.applications.saveNotes')}
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    {!selected.provisioned_company_id && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={provisionMutation.isPending || !selected.plan}
                        onClick={() => provisionMutation.mutate(selected.id)}
                      >
                        {provisionMutation.isPending ? <Spinner /> : t('admin.applications.createAccount')}
                      </Button>
                    )}
                    {selected.provisioned_company_id && (
                      <Button type="button" size="sm" variant="outline" asChild>
                        <Link to={`/admin/companies/${selected.provisioned_company_id}`}>
                          {t('admin.applications.viewCompany')}
                        </Link>
                      </Button>
                    )}
                    {selected.status !== 'reviewed' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={updateMutation.isPending}
                        onClick={() => handleStatusChange('reviewed')}
                      >
                        {t('admin.applications.markReviewed')}
                      </Button>
                    )}
                    {selected.status !== 'approved' && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={updateMutation.isPending}
                        onClick={() => handleStatusChange('approved')}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {t('admin.applications.approve')}
                      </Button>
                    )}
                    {selected.status !== 'rejected' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={updateMutation.isPending}
                        onClick={() => handleStatusChange('rejected')}
                      >
                        <X className="h-4 w-4" />
                        {t('admin.applications.reject')}
                      </Button>
                    )}
                  </div>
                  {provisionMsg && (
                    <p className={cn('text-sm', provisionMsg.type === 'ok' ? 'text-emerald-600' : 'text-rose-600')}>
                      {provisionMsg.text}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5', className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="truncate text-sm font-medium text-slate-800">{value}</p>
      </div>
    </div>
  );
}
