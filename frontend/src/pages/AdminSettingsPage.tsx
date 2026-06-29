/**
 * Super admin — platform ayarları (salt okunur özet)
 */

import { useQuery } from '@tanstack/react-query';
import { Settings, ExternalLink, Database, Cpu, Shield, Smartphone } from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, Spinner, Badge } from '@/components/ui';
import type { PlatformSettings } from '@/types';

export function AdminSettingsPage() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get<PlatformSettings>('/admin/settings'),
  });

  if (isLoading) {
    return <div className="flex justify-center p-12"><Spinner className="h-8 w-8" /></div>;
  }

  const items = [
    {
      icon: Database,
      title: 'Veritabanı',
      value: settings?.supabase_connected ? 'Supabase bağlı' : 'Demo modu',
      badge: settings?.supabase_connected ? 'success' as const : 'warning' as const,
    },
    {
      icon: Cpu,
      title: 'AI Modeli',
      value: settings?.ai_model || '—',
      sub: `Max token: ${settings?.ai_max_tokens} · Önbellek: ${settings?.ai_cache_enabled ? 'Açık' : 'Kapalı'}`,
    },
    {
      icon: Shield,
      title: 'Ortam',
      value: settings?.node_env || 'development',
      badge: settings?.demo_mode ? 'warning' as const : 'success' as const,
      sub: settings?.demo_mode ? 'Demo modu aktif' : 'Canlı mod',
    },
    {
      icon: Smartphone,
      title: 'WhatsApp Worker',
      value: settings?.whatsapp_worker ? 'Bağlı' : 'Yapılandırılmamış',
      badge: settings?.whatsapp_worker ? 'success' as const : 'warning' as const,
      sub: settings?.whatsapp_worker ? 'Railway worker aktif' : 'WHATSAPP_WORKER_URL gerekli',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Ayarları"
        description="Sistem yapılandırması özeti — hassas anahtarlar sunucu .env dosyasında tutulur"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Card key={item.title}>
            <CardContent className="p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                <item.icon className="h-5 w-5 text-slate-600" />
              </div>
              <p className="text-xs font-semibold uppercase text-slate-500">{item.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-900">{item.value}</p>
                {item.badge && <Badge variant={item.badge}>{item.badge === 'success' ? 'OK' : 'Demo'}</Badge>}
              </div>
              {item.sub && <p className="mt-1 text-xs text-slate-500">{item.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-5 w-5" />
            Yönetim Kılavuzu
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 p-4">
              <p className="font-semibold text-slate-800">Şirket İşlemleri</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-slate-500">
                <li>Yeni şirket: Şirketler → Yeni Şirket</li>
                <li>Paket/kota: Şirket detay → Abonelik</li>
                <li>Askıya alma: Şirket listesinden</li>
              </ul>
            </div>
            <div className="rounded-xl border border-slate-100 p-4">
              <p className="font-semibold text-slate-800">AI & Faturalandırma</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-slate-500">
                <li>Panel: AI Kullanımı sayfası</li>
                <li>Gerçek fatura: OpenAI dashboard</li>
              </ul>
              <a
                href="https://platform.openai.com/usage"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-teal-600 hover:underline"
              >
                OpenAI Usage <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            API anahtarları (OpenAI, Supabase, WhatsApp) yalnızca backend .env üzerinden değiştirilir.
            Değişiklik sonrası sunucuyu yeniden başlatın.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
