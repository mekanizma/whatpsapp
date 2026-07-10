/**
 * Admin dashboard — aksiyon merkezi (dikkat gerektiren şirketler ve talepler)
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  CreditCard,
  MessageSquare,
  Smartphone,
  Ticket,
} from 'lucide-react';
import { api } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle, Spinner, Badge } from '@/components/ui';
import type { ActionCenterCategory, ActionCenterData, ActionCenterItem } from '@/types';
import { cn } from '@/lib/utils';

const CATEGORY_ICONS: Record<ActionCenterCategory, typeof Bell> = {
  quota: CreditCard,
  whatsapp: Smartphone,
  trial: Clock,
  activity: MessageSquare,
  tickets: Ticket,
};

const SEVERITY_STYLES = {
  critical: 'bg-rose-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
} as const;

function groupItems(items: ActionCenterItem[]) {
  const order: ActionCenterCategory[] = ['quota', 'whatsapp', 'trial', 'tickets', 'activity'];
  const groups = new Map<ActionCenterCategory, ActionCenterItem[]>();

  for (const item of items) {
    const list = groups.get(item.category) || [];
    list.push(item);
    groups.set(item.category, list);
  }

  return order
    .filter((cat) => groups.has(cat))
    .map((cat) => ({ category: cat, items: groups.get(cat)! }));
}

export function AdminActionCenter() {
  const { t } = useTranslation();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-action-center'],
    queryFn: () => api.get<ActionCenterData>('/admin/action-center'),
    refetchInterval: 60_000,
  });

  const renderDetail = (item: ActionCenterItem) =>
    t(`admin.actionCenter.details.${item.type}`, {
      percent: item.meta.quota_percent,
      used: item.meta.messages_used?.toLocaleString(),
      limit: item.meta.messages_limit?.toLocaleString(),
      days: item.meta.days_left,
      hours: item.meta.hours_inactive,
      subject: item.meta.ticket_subject,
      defaultValue: item.company_name,
    });

  return (
    <Card className="overflow-hidden border-amber-200/60 bg-gradient-to-br from-amber-50/40 via-white to-white">
      <CardHeader className="space-y-3 pb-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100">
            <Bell className="h-5 w-5 text-amber-700" />
          </div>
          {t('admin.actionCenter.title')}
        </CardTitle>
        {data && data.total > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.critical_count > 0 && (
              <Badge variant="danger">
                {t('admin.actionCenter.criticalCount', { count: data.critical_count })}
              </Badge>
            )}
            {data.warning_count > 0 && (
              <Badge variant="warning">
                {t('admin.actionCenter.warningCount', { count: data.warning_count })}
              </Badge>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-7 w-7" />
          </div>
        ) : isError ? (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {t('admin.actionCenter.loadError')}
          </p>
        ) : !data || data.total === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-4">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium text-emerald-900">{t('admin.actionCenter.allClear')}</p>
              <p className="text-sm text-emerald-700">{t('admin.actionCenter.allClearDesc')}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {groupItems(data.items).map(({ category, items }) => {
              const Icon = CATEGORY_ICONS[category];
              return (
                <div key={category}>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Icon className="h-3.5 w-3.5" />
                    {t(`admin.actionCenter.categories.${category}`)}
                  </p>
                  <ul className="space-y-2">
                    {items.map((item) => (
                      <li key={item.id}>
                        <Link
                          to={
                            item.type === 'open_platform_support'
                              ? '/admin/support-tickets'
                              : `/admin/companies/${item.company_id}`
                          }
                          className="group flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 transition hover:border-amber-200 hover:bg-amber-50/30 sm:items-center"
                        >
                          <span
                            className={cn(
                              'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full sm:mt-0',
                              SEVERITY_STYLES[item.severity]
                            )}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-slate-900">{item.company_name}</p>
                            <p className="text-sm text-slate-600">{renderDetail(item)}</p>
                          </div>
                          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-amber-600 sm:mt-0" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('admin.actionCenter.hint')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
