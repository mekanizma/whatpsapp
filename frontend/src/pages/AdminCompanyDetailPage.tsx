/**
 * Super admin — şirket detay ve yönetim
 */

import { useState } from 'react';
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

const PLANS = [
  { value: 'starter', label: 'Starter' },
  { value: 'business', label: 'Business' },
  { value: 'enterprise', label: 'Enterprise' },
];

const STATUSES = [
  { value: 'trial', label: 'Deneme' },
  { value: 'active', label: 'Aktif' },
  { value: 'suspended', label: 'Askıda' },
  { value: 'inactive', label: 'Pasif' },
];

export function AdminCompanyDetailPage() {
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
        <p className="text-rose-600">Şirket bulunamadı</p>
        <Button variant="outline" asChild>
          <Link to="/admin/companies"><ArrowLeft className="h-4 w-4" /> Geri</Link>
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
    { id: 'genel' as const, label: 'Genel Bilgiler' },
    { id: 'abonelik' as const, label: 'Abonelik & Kota' },
    { id: 'kullanicilar' as const, label: 'Kullanıcılar' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/companies"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <PageHeader
          title={company.company_name}
          description={`ID: ${company.id.slice(0, 8)}… · ${company.subscription_plan} paket`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="Mesajlar" value={stats.total_messages} icon={MessageSquare} color="text-blue-600" bgColor="bg-blue-50" />
        <StatCard title="AI Yanıt" value={stats.ai_responses} icon={Zap} color="text-teal-600" bgColor="bg-teal-50" />
        <StatCard title="Transfer" value={stats.transferred} icon={Ticket} color="text-amber-600" bgColor="bg-amber-50" />
        <StatCard title="Personel" value={staff_count} icon={Users} color="text-violet-600" bgColor="bg-violet-50" />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Smartphone className="h-5 w-5 text-slate-400" />
          <span className="text-sm">
            WhatsApp:{' '}
            <Badge variant={whatsapp?.status === 'connected' ? 'success' : 'warning'}>
              {whatsapp?.status === 'connected'
                ? whatsapp.phone_number || 'Bağlı'
                : 'Bağlı değil'}
            </Badge>
          </span>
          <span className="text-sm text-slate-500">
            AI token (ay): {stats.ai_tokens_used.toLocaleString('tr-TR')}
          </span>
        </CardContent>
      </Card>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition',
              tab === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'genel' && (
        <Card>
          <CardHeader><CardTitle>Şirket Bilgileri</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Şirket Adı</Label>
                <Input
                  value={companyForm.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Durum</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  value={companyForm.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>E-posta</Label>
                <Input
                  type="email"
                  value={companyForm.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input
                  value={companyForm.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Adres</Label>
                <Input
                  value={companyForm.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
            </div>
            <Button
              onClick={() => updateMutation.mutate(companyForm)}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? <Spinner /> : <><Save className="h-4 w-4" /> Kaydet</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === 'abonelik' && subscription && (
        <Card>
          <CardHeader><CardTitle>Abonelik & Mesaj Kotası</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Paket</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  defaultValue={subscription.plan?.plan_type || company.subscription_plan}
                  onChange={(e) => subMutation.mutate({ plan_type: e.target.value })}
                >
                  {PLANS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Abonelik Durumu</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  defaultValue={subscription.status}
                  onChange={(e) => subMutation.mutate({ status: e.target.value })}
                >
                  <option value="trial">Deneme</option>
                  <option value="active">Aktif</option>
                  <option value="cancelled">İptal</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Mesaj Limiti</Label>
                <Input
                  type="number"
                  defaultValue={subscription.messages_limit}
                  onBlur={(e) =>
                    subMutation.mutate({ messages_limit: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Kullanılan Mesaj</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    defaultValue={subscription.messages_used}
                    onBlur={(e) =>
                      subMutation.mutate({ messages_used: parseInt(e.target.value) || 0 })
                    }
                  />
                  <Button
                    variant="outline"
                    onClick={() => subMutation.mutate({ messages_used: 0 })}
                    disabled={subMutation.isPending}
                  >
                    <RotateCcw className="h-4 w-4" /> Sıfırla
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-sm text-slate-500">
              Kullanıcı limiti: {subscription.users_limit} · Bu ay AI API: {stats.ai_api_calls} çağrı
              · Önbellek: {stats.ai_cached_hits} · Atlanan: {stats.ai_skipped}
            </p>
          </CardContent>
        </Card>
      )}

      {tab === 'kullanicilar' && (
        <Card>
          <CardHeader><CardTitle>Panel Kullanıcıları</CardTitle></CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <p className="text-sm text-slate-500">Henüz kullanıcı yok. Şirket oluştururken admin ekleyebilirsiniz.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {users.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="font-medium">{u.full_name}</p>
                      <p className="text-xs text-slate-500">
                        {u.role} · {new Date(u.created_at).toLocaleDateString('tr-TR')}
                      </p>
                    </div>
                    <Badge variant={u.is_active ? 'success' : 'warning'}>
                      {u.is_active ? 'Aktif' : 'Pasif'}
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
