/**
 * Super admin — platform geneli AI kullanımı
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Zap, ExternalLink } from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, Spinner, Badge } from '@/components/ui';
import type { AIUsageRow, PlatformStats } from '@/types';
import { cn } from '@/lib/utils';

export function AdminUsagePage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';

  const { data: usage, isLoading } = useQuery({
    queryKey: ['admin-ai-usage'],
    queryFn: () => api.get<AIUsageRow[]>('/admin/ai-usage'),
  });

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get<PlatformStats>('/admin/stats'),
  });

  const rows = usage || [];
  const totalTokens = rows.reduce((s, r) => s + r.tokens, 0);
  const totalApi = rows.reduce((s, r) => s + r.api_calls, 0);
  const totalSaved = rows.reduce((s, r) => s + r.saved, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.usage.title')}
        description={t('admin.usage.description')}
        action={
          <a
            href="https://platform.openai.com/usage"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-teal-600 hover:underline"
          >
            {t('admin.usage.billing')} <ExternalLink className="h-4 w-4" />
          </a>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase text-slate-500">{t('admin.usage.totalTokens')}</p>
            <p className="text-2xl font-bold tabular-nums">{totalTokens.toLocaleString(locale)}</p>
            <p className="text-xs text-slate-400">{t('admin.overview.modelTrend', { model: stats?.ai_model || '—' })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase text-slate-500">{t('admin.usage.apiCalls')}</p>
            <p className="text-2xl font-bold tabular-nums">{totalApi.toLocaleString(locale)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase text-slate-500">{t('admin.usage.saved')}</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-600">{totalSaved.toLocaleString(locale)}</p>
            <p className="text-xs text-slate-400">{t('admin.usage.savedHint')}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner className="h-8 w-8" /></div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-5 w-5 text-amber-500" />
              {t('admin.usage.byCompany')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs uppercase text-slate-500">
                    <th className="px-4 py-3 font-semibold">{t('admin.usage.company')}</th>
                    <th className="px-4 py-3 font-semibold">{t('admin.usage.token')}</th>
                    <th className="px-4 py-3 font-semibold">{t('admin.usage.apiCall')}</th>
                    <th className="px-4 py-3 font-semibold">{t('admin.usage.savings')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.company_id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <Link to={`/admin/companies/${row.company_id}`} className="font-medium text-teal-600 hover:underline">
                          {row.company_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{row.tokens.toLocaleString(locale)}</td>
                      <td className="px-4 py-3 tabular-nums">{row.api_calls}</td>
                      <td className="px-4 py-3">
                        <Badge variant={row.saved > 0 ? 'success' : 'info'}>{row.saved}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {rows.map((row) => (
                <Link
                  key={row.company_id}
                  to={`/admin/companies/${row.company_id}`}
                  className="block rounded-xl border border-slate-100 p-4 transition hover:bg-slate-50"
                >
                  <p className="font-medium">{row.company_name}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500">
                    <span>{t('admin.usage.tokenMobile', { count: row.tokens.toLocaleString(locale) })}</span>
                    <span>{t('admin.usage.apiMobile', { count: row.api_calls })}</span>
                    <span className={cn(row.saved > 0 && 'text-emerald-600')}>
                      {t('admin.usage.savedMobile', { count: row.saved })}
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            {rows.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-500">{t('admin.usage.empty')}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
