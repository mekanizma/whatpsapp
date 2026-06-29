/**
 * Super admin — şirket listesi ve oluşturma
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ChevronRight, Pause, Play, Smartphone } from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import {
  Button, Input, Label, Card, CardContent, CardHeader, CardTitle,
  Spinner, Badge,
} from '@/components/ui';
import type { AdminCompany } from '@/types';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { value: 'universite', label: 'Üniversite' },
  { value: 'klinik', label: 'Klinik' },
  { value: 'dis_hekimi', label: 'Diş Hekimi' },
  { value: 'guzellik_merkezi', label: 'Güzellik Merkezi' },
  { value: 'emlak', label: 'Emlak' },
  { value: 'rent_a_car', label: 'Rent a Car' },
  { value: 'otel', label: 'Otel' },
  { value: 'restoran', label: 'Restoran' },
  { value: 'kurs', label: 'Kurs' },
  { value: 'diger', label: 'Diğer' },
];

const PLANS = [
  { value: 'starter', label: 'Starter (1.000 mesaj)' },
  { value: 'business', label: 'Business (5.000 mesaj)' },
  { value: 'enterprise', label: 'Enterprise (Sınırsız)' },
];

const STATUS_LABELS: Record<string, string> = {
  active: 'Aktif',
  trial: 'Deneme',
  suspended: 'Askıda',
  inactive: 'Pasif',
};

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-teal-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{used.toLocaleString('tr-TR')} / {limit.toLocaleString('tr-TR')}</span>
        <span>%{pct}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function AdminCompaniesPage() {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    company_name: '',
    category: 'diger',
    email: '',
    phone: '',
    subscription_plan: 'starter',
    admin_full_name: '',
    admin_email: '',
    admin_password: '',
  });
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-companies', search],
    queryFn: () => api.getWithMeta<AdminCompany[]>(`/admin/companies?search=${encodeURIComponent(search)}`),
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, string>) => api.post('/admin/companies', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      setShowForm(false);
      setForm({
        company_name: '', category: 'diger', email: '', phone: '',
        subscription_plan: 'starter', admin_full_name: '', admin_email: '', admin_password: '',
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/admin/companies/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-companies'] }),
  });

  const companies = data?.data || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Şirketler"
        description="Tüm müşteri şirketlerini yönetin, kota ve durumlarını kontrol edin"
        action={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Yeni Şirket
          </Button>
        }
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Şirket adı veya e-posta ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Yeni Şirket Oluştur</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Şirket Adı *</Label>
                <Input
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  placeholder="Örn: Demo Klinik"
                />
              </div>
              <div className="space-y-2">
                <Label>Kategori</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Paket</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  value={form.subscription_plan}
                  onChange={(e) => setForm({ ...form, subscription_plan: e.target.value })}
                >
                  {PLANS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Şirket E-posta</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-700">Şirket Yöneticisi (Opsiyonel)</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Ad Soyad</Label>
                  <Input
                    value={form.admin_full_name}
                    onChange={(e) => setForm({ ...form, admin_full_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Giriş E-posta</Label>
                  <Input
                    type="email"
                    value={form.admin_email}
                    onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Şifre</Label>
                  <Input
                    type="password"
                    value={form.admin_password}
                    onChange={(e) => setForm({ ...form, admin_password: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.company_name.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? <Spinner /> : 'Şirketi Oluştur'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>İptal</Button>
              {createMutation.isError && (
                <p className="w-full text-sm text-rose-600">
                  {(createMutation.error as Error).message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner className="h-8 w-8" /></div>
      ) : companies.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            {search ? 'Arama sonucu bulunamadı' : 'Henüz şirket eklenmemiş'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {companies.map((company) => {
            const sub = company.subscription;
            const wa = company.whatsapp;
            const isSuspended = company.status === 'suspended';

            return (
              <Card key={company.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/admin/companies/${company.id}`}
                          className="text-lg font-semibold text-slate-900 hover:text-teal-600"
                        >
                          {company.company_name}
                        </Link>
                        <Badge variant="info">
                          {CATEGORIES.find((c) => c.value === company.category)?.label || company.category}
                        </Badge>
                        <Badge variant={company.status === 'active' || company.status === 'trial' ? 'success' : 'warning'}>
                          {STATUS_LABELS[company.status] || company.status}
                        </Badge>
                        <Badge>{company.subscription_plan}</Badge>
                      </div>
                      <p className="text-sm text-slate-500">{company.email || '—'} · {company.phone || '—'}</p>
                      {sub && (
                        <div className="max-w-xs">
                          <UsageBar used={sub.messages_used} limit={sub.messages_limit} />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>{company.message_count ?? 0} mesaj</span>
                        <span>{(company.ai_tokens_month ?? 0).toLocaleString('tr-TR')} AI token (ay)</span>
                        <span className="flex items-center gap-1">
                          <Smartphone className="h-3 w-3" />
                          WA: {wa?.status === 'connected' ? wa.phone_number || 'Bağlı' : 'Bağlı değil'}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          statusMutation.mutate({
                            id: company.id,
                            status: isSuspended ? 'active' : 'suspended',
                          })
                        }
                        disabled={statusMutation.isPending}
                      >
                        {isSuspended ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                        {isSuspended ? 'Aktifleştir' : 'Askıya Al'}
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/admin/companies/${company.id}`}>
                          Detay <ChevronRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
