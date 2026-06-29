/**
 * Dashboard page
 */

import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Bot, UserCheck, Users, TrendingUp, ArrowRightLeft, Zap, Database, Shield } from 'lucide-react';
import { api } from '@/services/api';
import { StatCard } from '@/components/StatCard';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Spinner } from '@/components/ui';
import type { DashboardStats } from '@/types';

export function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardStats>('/dashboard'),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const usagePercent = stats
    ? Math.round((stats.messages_used / stats.messages_limit) * 100)
    : 0;

  const aiSaved = (stats?.ai_cached_hits ?? 0) + (stats?.ai_skipped ?? 0);
  const aiTotal = aiSaved + (stats?.ai_api_calls ?? 0);
  const aiSavePercent = aiTotal > 0 ? Math.round((aiSaved / aiTotal) * 100) : 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Mesaj trafiği, AI performansı ve kullanım limitlerinizin özeti"
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Toplam Mesaj" value={stats?.total_messages ?? 0} icon={MessageSquare} color="text-sky-600" bgColor="bg-sky-50" />
        <StatCard title="Bugünkü Mesajlar" value={stats?.today_messages ?? 0} icon={TrendingUp} color="text-emerald-600" bgColor="bg-emerald-50" />
        <StatCard title="AI Cevapları" value={stats?.ai_responses ?? 0} icon={Bot} color="text-violet-600" bgColor="bg-violet-50" />
        <StatCard title="Personele Aktarılan" value={stats?.transferred ?? 0} icon={ArrowRightLeft} color="text-orange-600" bgColor="bg-orange-50" />
        <StatCard title="Aktif Müşteriler" value={stats?.active_customers ?? 0} icon={Users} color="text-cyan-600" bgColor="bg-cyan-50" />
        <StatCard title="Kullanım Limiti" value={`${stats?.messages_used ?? 0} / ${stats?.messages_limit ?? 0}`} icon={UserCheck} color="text-primary" bgColor="bg-primary/10" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              AI Kredi Optimizasyonu
            </CardTitle>
            <CardDescription>Bu ayki token tasarrufu ve filtreleme istatistikleri</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'API Çağrısı', value: stats?.ai_api_calls ?? 0, color: 'text-violet-600', bg: 'bg-violet-50' },
                { label: 'Önbellek', value: stats?.ai_cached_hits ?? 0, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: Database },
                { label: 'Filtrelendi', value: stats?.ai_skipped ?? 0, color: 'text-sky-600', bg: 'bg-sky-50', icon: Shield },
                { label: 'Tasarruf', value: `%${aiSavePercent}`, color: 'text-amber-600', bg: 'bg-amber-50' },
              ].map((item) => (
                <div key={item.label} className={`rounded-xl ${item.bg} p-4 text-center ring-1 ring-black/5`}>
                  <p className={`text-2xl font-bold tabular-nums ${item.color}`}>{item.value}</p>
                  <p className="mt-1 flex items-center justify-center gap-1 text-xs font-medium text-slate-600">
                    {item.icon && <item.icon className="h-3 w-3" />}
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Bu ay {(stats?.ai_tokens_used ?? 0).toLocaleString('tr-TR')} token kullanıldı.
              {aiSaved > 0 && ` · ${aiSaved} çağrı önbellek/filtre ile atlandı.`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mesaj Kullanımı</CardTitle>
            <CardDescription>Aylık abonelik mesaj kotanız</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-3xl font-bold tabular-nums text-slate-900">{usagePercent}%</p>
                  <p className="text-sm text-slate-500">kullanıldı</p>
                </div>
                <p className="text-sm font-medium text-slate-600">
                  {stats?.messages_used ?? 0} / {stats?.messages_limit ?? 0}
                </p>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
