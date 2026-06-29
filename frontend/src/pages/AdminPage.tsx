/**
 * Super admin — platform overview
 */

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Building2, MessageSquare, CreditCard, Zap, Ticket, Smartphone,
  ArrowRight, Plus, Activity,
} from 'lucide-react';
import { api } from '@/services/api';
import { StatCard } from '@/components/StatCard';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, CardContent, CardHeader, CardTitle, Spinner, Badge } from '@/components/ui';
import type { PlatformStats, AdminCompany } from '@/types';

export function AdminPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get<PlatformStats>('/admin/stats'),
  });

  const { data: companiesData, isLoading: companiesLoading } = useQuery({
    queryKey: ['admin-companies-recent'],
    queryFn: () => api.getWithMeta<AdminCompany[]>('/admin/companies?limit=5'),
  });

  if (statsLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const recent = companiesData?.data || [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Platform Özeti"
        description="Tüm şirketler, kullanım ve AI istatistikleri tek ekranda"
        action={
          <Button asChild>
            <Link to="/admin/companies">
              <Plus className="h-4 w-4" />
              Yeni Şirket
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Toplam Şirket"
          value={stats?.total_companies ?? 0}
          icon={Building2}
          color="text-blue-600"
          bgColor="bg-blue-50"
        />
        <StatCard
          title="Toplam Mesaj"
          value={stats?.total_messages ?? 0}
          icon={MessageSquare}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
        />
        <StatCard
          title="Kullanılan Kota"
          value={stats?.total_messages_used ?? 0}
          icon={CreditCard}
          color="text-violet-600"
          bgColor="bg-violet-50"
        />
        <StatCard
          title="Aktif Abonelik"
          value={stats?.active_subscriptions ?? 0}
          icon={CreditCard}
          color="text-amber-600"
          bgColor="bg-amber-50"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="AI Token (Bu Ay)"
          value={(stats?.ai_tokens_month ?? 0).toLocaleString('tr-TR')}
          icon={Zap}
          trend={`Model: ${stats?.ai_model || '—'}`}
          color="text-teal-600"
          bgColor="bg-teal-50"
        />
        <StatCard
          title="AI API Çağrısı"
          value={stats?.ai_api_calls_month ?? 0}
          icon={Zap}
          trend={`${stats?.ai_saved_month ?? 0} istek önbellek/filtre ile tasarruf`}
          color="text-orange-600"
          bgColor="bg-orange-50"
        />
        <StatCard
          title="Açık Talepler"
          value={stats?.open_tickets ?? 0}
          icon={Ticket}
          color="text-rose-600"
          bgColor="bg-rose-50"
        />
        <StatCard
          title="WhatsApp Bağlı"
          value={stats?.whatsapp_connected ?? 0}
          icon={Smartphone}
          color="text-green-600"
          bgColor="bg-green-50"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Son Eklenen Şirketler</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/companies">
                Tümü <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {companiesLoading ? (
              <Spinner className="mx-auto h-6 w-6" />
            ) : recent.length === 0 ? (
              <p className="text-sm text-slate-500">Henüz şirket yok</p>
            ) : (
              recent.map((c) => (
                <Link
                  key={c.id}
                  to={`/admin/companies/${c.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 transition hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{c.company_name}</p>
                    <p className="truncate text-xs text-slate-500">{c.email || '—'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={c.status === 'active' ? 'success' : 'warning'}>{c.status}</Badge>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Hızlı Erişim</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {[
              { to: '/admin/companies', label: 'Şirket Yönetimi', icon: Building2 },
              { to: '/admin/usage', label: 'AI Kullanımı', icon: Zap },
              { to: '/admin/activity', label: 'Aktivite Logları', icon: Activity },
              { to: '/admin/settings', label: 'Platform Ayarları', icon: CreditCard },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 rounded-xl border border-slate-100 p-4 transition hover:border-teal-200 hover:bg-teal-50/50"
              >
                <item.icon className="h-5 w-5 text-teal-600" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
