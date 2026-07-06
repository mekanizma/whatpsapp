/**
 * Super admin — WhatsApp bağlantı sağlık monitörü
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Smartphone,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  QrCode,
  Loader2,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import {
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
  Badge,
} from '@/components/ui';
import type { WhatsAppHealthData, WhatsAppHealthStatus } from '@/types';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'issues' | WhatsAppHealthStatus;

const STATUS_FILTERS: StatusFilter[] = [
  'all',
  'issues',
  'connected',
  'disconnected',
  'qr_pending',
  'reconnecting',
  'error',
];

const STATUS_BADGE: Record<
  WhatsAppHealthStatus,
  { variant: 'success' | 'danger' | 'warning' | 'info' | 'default'; icon: typeof CheckCircle2 }
> = {
  connected: { variant: 'success', icon: CheckCircle2 },
  disconnected: { variant: 'danger', icon: XCircle },
  qr_pending: { variant: 'warning', icon: QrCode },
  reconnecting: { variant: 'info', icon: Loader2 },
  error: { variant: 'danger', icon: AlertTriangle },
  not_configured: { variant: 'default', icon: XCircle },
};

function formatRelativeTime(
  iso: string | null,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return t('admin.whatsappHealth.relative.justNow');
  if (mins < 60) return t('admin.whatsappHealth.relative.minutes', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('admin.whatsappHealth.relative.hours', { count: hours });
  const days = Math.floor(hours / 24);
  return t('admin.whatsappHealth.relative.days', { count: days });
}

export function AdminWhatsAppHealthPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['admin-whatsapp-health', statusFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      const qs = params.toString();
      return api.get<WhatsAppHealthData>(`/admin/whatsapp-health${qs ? `?${qs}` : ''}`);
    },
    refetchInterval: 60_000,
  });

  const summary = data?.summary;
  const accounts = data?.accounts || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.whatsappHealth.title')}
        description={t('admin.whatsappHealth.description')}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            {t('admin.whatsappHealth.refresh')}
          </Button>
        }
      />

      {dataUpdatedAt > 0 && (
        <p className="text-xs text-slate-500">
          {t('admin.whatsappHealth.lastChecked', {
            time: new Date(dataUpdatedAt).toLocaleTimeString(locale),
          })}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title={t('admin.whatsappHealth.stats.total')}
          value={summary?.total_accounts ?? 0}
          icon={Smartphone}
          color="text-slate-600"
          bgColor="bg-slate-50"
        />
        <StatCard
          title={t('admin.whatsappHealth.stats.connected')}
          value={summary?.connected ?? 0}
          icon={CheckCircle2}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
        />
        <StatCard
          title={t('admin.whatsappHealth.stats.disconnected')}
          value={summary?.disconnected ?? 0}
          icon={XCircle}
          color="text-rose-600"
          bgColor="bg-rose-50"
        />
        <StatCard
          title={t('admin.whatsappHealth.stats.qrPending')}
          value={summary?.qr_pending ?? 0}
          icon={QrCode}
          color="text-amber-600"
          bgColor="bg-amber-50"
        />
        <StatCard
          title={t('admin.whatsappHealth.stats.reconnecting')}
          value={summary?.reconnecting ?? 0}
          icon={Loader2}
          color="text-sky-600"
          bgColor="bg-sky-50"
        />
        <StatCard
          title={t('admin.whatsappHealth.stats.issues')}
          value={summary?.issues ?? 0}
          icon={AlertTriangle}
          color="text-orange-600"
          bgColor="bg-orange-50"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.whatsappHealth.search')}
            className="pl-9"
          />
        </div>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setStatusFilter(filter)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition',
              statusFilter === filter
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {t(`admin.whatsappHealth.filters.${filter}`)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-rose-600">
            {t('admin.whatsappHealth.loadError')}
          </CardContent>
        </Card>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            {t('admin.whatsappHealth.empty')}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="hidden border-b border-slate-100 pb-3 md:block">
            <CardTitle className="text-base">{t('admin.whatsappHealth.accountList')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100">
              {accounts.map((account) => {
                const badge = STATUS_BADGE[account.health_status];
                const StatusIcon = badge.icon;
                return (
                  <li key={account.account_id}>
                    <Link
                      to={`/admin/companies/${account.company_id}`}
                      className="group flex flex-col gap-3 p-4 transition hover:bg-slate-50 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div
                          className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                            account.health_status === 'connected'
                              ? 'bg-emerald-50'
                              : account.health_status === 'qr_pending' ||
                                  account.health_status === 'reconnecting'
                                ? 'bg-amber-50'
                                : 'bg-rose-50'
                          )}
                        >
                          <StatusIcon
                            className={cn(
                              'h-5 w-5',
                              account.health_status === 'connected' && 'text-emerald-600',
                              (account.health_status === 'qr_pending' ||
                                account.health_status === 'reconnecting') &&
                                'text-amber-600',
                              account.health_status === 'reconnecting' && 'animate-spin',
                              (account.health_status === 'disconnected' ||
                                account.health_status === 'error') &&
                                'text-rose-600'
                            )}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium text-slate-900">
                              {account.company_name}
                            </p>
                            {account.label && (
                              <span className="truncate text-xs text-slate-500">
                                · {account.label}
                              </span>
                            )}
                            {!account.is_active && (
                              <Badge variant="default">{t('admin.whatsappHealth.inactive')}</Badge>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-sm text-slate-600">
                            {account.phone_number || t('admin.whatsappHealth.noPhone')}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span>
                              {t('admin.whatsappHealth.lastSync')}:{' '}
                              {formatRelativeTime(account.last_synced_at, t)}
                            </span>
                            <span>
                              {t('admin.whatsappHealth.lastMessage')}:{' '}
                              {formatRelativeTime(account.last_message_at, t)}
                            </span>
                            <span>
                              {t(`admin.whatsappHealth.connectionType.${account.connection_type}`)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:shrink-0 sm:flex-col sm:items-end">
                        <Badge variant={badge.variant}>
                          {t(`admin.whatsappHealth.status.${account.health_status}`)}
                        </Badge>
                        <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:text-teal-600" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
