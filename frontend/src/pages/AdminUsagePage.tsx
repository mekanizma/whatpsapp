/**
 * Super admin — platform geneli AI kullanımı
 */

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Zap, ExternalLink } from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, Spinner, Badge } from '@/components/ui';
import type { AIUsageRow, PlatformStats } from '@/types';
import { cn } from '@/lib/utils';

export function AdminUsagePage() {
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
        title="AI Kullanımı"
        description="Şirket bazında token tüketimi ve optimizasyon istatistikleri (bu ay)"
        action={
          <a
            href="https://platform.openai.com/usage"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-teal-600 hover:underline"
          >
            OpenAI Faturalandırma <ExternalLink className="h-4 w-4" />
          </a>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase text-slate-500">Toplam Token</p>
            <p className="text-2xl font-bold tabular-nums">{totalTokens.toLocaleString('tr-TR')}</p>
            <p className="text-xs text-slate-400">Model: {stats?.ai_model || '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase text-slate-500">API Çağrıları</p>
            <p className="text-2xl font-bold tabular-nums">{totalApi.toLocaleString('tr-TR')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase text-slate-500">Tasarruf Edilen</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-600">{totalSaved.toLocaleString('tr-TR')}</p>
            <p className="text-xs text-slate-400">Önbellek + ön filtre</p>
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
              Şirket Bazında Kullanım
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs uppercase text-slate-500">
                    <th className="px-4 py-3 font-semibold">Şirket</th>
                    <th className="px-4 py-3 font-semibold">Token</th>
                    <th className="px-4 py-3 font-semibold">API Çağrı</th>
                    <th className="px-4 py-3 font-semibold">Tasarruf</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.company_id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <Link
                          to={`/admin/companies/${row.company_id}`}
                          className="font-medium text-teal-600 hover:underline"
                        >
                          {row.company_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{row.tokens.toLocaleString('tr-TR')}</td>
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
                    <span>{row.tokens.toLocaleString('tr-TR')} token</span>
                    <span>{row.api_calls} API</span>
                    <span className={cn(row.saved > 0 && 'text-emerald-600')}>{row.saved} tasarruf</span>
                  </div>
                </Link>
              ))}
            </div>

            {rows.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-500">Bu ay henüz AI kullanımı yok</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
