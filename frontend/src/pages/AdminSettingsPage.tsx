/**
 * Super admin — platform ayarları + fatura satıcı bilgileri
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, ExternalLink, Database, Cpu, Shield, Smartphone, FileText } from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Spinner,
  Badge,
  Textarea,
} from '@/components/ui';
import type { InvoiceIssuerSettings, PlatformSettings } from '@/types';

const emptyInvoiceForm: InvoiceIssuerSettings = {
  name: '',
  legalName: '',
  address: '',
  taxOffice: '',
  taxNumber: '',
  email: '',
  phone: '',
  website: '',
  vatRate: 20,
  footerNote: '',
};

export function AdminSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [invoiceForm, setInvoiceForm] = useState<InvoiceIssuerSettings>(emptyInvoiceForm);
  const [invoiceFeedback, setInvoiceFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get<PlatformSettings>('/admin/settings'),
  });

  const { data: invoiceSettings, isLoading: invoiceLoading } = useQuery({
    queryKey: ['admin-invoice-settings'],
    queryFn: () => api.get<InvoiceIssuerSettings>('/admin/invoice-settings'),
  });

  useEffect(() => {
    if (invoiceSettings) {
      setInvoiceForm({
        ...invoiceSettings,
        footerNote: invoiceSettings.footerNote || '',
      });
    }
  }, [invoiceSettings]);

  const saveInvoiceMutation = useMutation({
    mutationFn: () =>
      api.put<InvoiceIssuerSettings>('/admin/invoice-settings', {
        ...invoiceForm,
        footerNote: invoiceForm.footerNote?.trim() || null,
        vatRate: Number(invoiceForm.vatRate) || 0,
      }),
    onSuccess: () => {
      setInvoiceFeedback({ type: 'success', text: t('admin.settings.invoiceSaved') });
      queryClient.invalidateQueries({ queryKey: ['admin-invoice-settings'] });
    },
    onError: (err) => {
      setInvoiceFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t('admin.settings.invoiceSaveError'),
      });
    },
  });

  if (isLoading || invoiceLoading) {
    return <div className="flex justify-center p-12"><Spinner className="h-8 w-8" /></div>;
  }

  const items = [
    {
      icon: Database,
      titleKey: 'admin.settings.database',
      value: settings?.supabase_connected ? t('admin.settings.dbConnected') : t('admin.settings.dbDemo'),
      badge: settings?.supabase_connected ? 'success' as const : 'warning' as const,
    },
    {
      icon: Cpu,
      titleKey: 'admin.settings.aiModel',
      value: settings?.ai_model || '—',
      sub: t('admin.settings.aiModelSub', {
        max: settings?.ai_max_tokens,
        cache: settings?.ai_cache_enabled ? t('admin.settings.cacheEnabled') : t('admin.settings.cacheDisabled'),
      }),
    },
    {
      icon: Shield,
      titleKey: 'admin.settings.environment',
      value: settings?.node_env || 'development',
      badge: settings?.demo_mode ? 'warning' as const : 'success' as const,
      sub: settings?.demo_mode ? t('admin.settings.demoActive') : t('admin.settings.liveMode'),
    },
    {
      icon: Smartphone,
      titleKey: 'admin.settings.whatsappMode',
      value: settings?.whatsapp_mode === 'cloud_api' ? t('admin.settings.cloudApi') : t('admin.settings.qrLocal'),
      badge: 'success' as const,
      sub: settings?.whatsapp_mode === 'cloud_api' ? t('admin.settings.metaWebhook') : t('admin.settings.devMode'),
    },
  ];

  const guideItems = [
    t('admin.settings.newCompanyGuide'),
    t('admin.settings.quotaGuide'),
    t('admin.settings.suspendGuide'),
  ];

  const billingItems = [
    t('admin.settings.usagePage'),
    t('admin.settings.openaiDashboard'),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.settings.title')}
        description={t('admin.settings.description')}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Card key={item.titleKey}>
            <CardContent className="p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                <item.icon className="h-5 w-5 text-slate-600" />
              </div>
              <p className="text-xs font-semibold uppercase text-slate-500">{t(item.titleKey)}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-900">{item.value}</p>
                {item.badge && (
                  <Badge variant={item.badge}>
                    {item.badge === 'success' ? t('admin.settings.ok') : t('admin.settings.demoBadge')}
                  </Badge>
                )}
              </div>
              {item.sub && <p className="mt-1 text-xs text-slate-500">{item.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <FileText className="h-5 w-5" />
            {t('admin.settings.invoiceTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">{t('admin.settings.invoiceDesc')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('admin.settings.issuerName')}</Label>
              <Input
                value={invoiceForm.name}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('admin.settings.legalName')}</Label>
              <Input
                value={invoiceForm.legalName}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, legalName: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t('admin.settings.address')}</Label>
              <Input
                value={invoiceForm.address}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, address: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('admin.settings.taxOffice')}</Label>
              <Input
                value={invoiceForm.taxOffice}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, taxOffice: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('admin.settings.taxNumber')}</Label>
              <Input
                value={invoiceForm.taxNumber}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, taxNumber: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('admin.settings.email')}</Label>
              <Input
                type="email"
                value={invoiceForm.email}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('admin.settings.phone')}</Label>
              <Input
                value={invoiceForm.phone}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('admin.settings.website')}</Label>
              <Input
                value={invoiceForm.website}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, website: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('admin.settings.vatRate')}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={invoiceForm.vatRate}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, vatRate: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t('admin.settings.footerNote')}</Label>
              <Textarea
                rows={3}
                value={invoiceForm.footerNote || ''}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, footerNote: e.target.value })}
                placeholder={t('admin.settings.footerNotePlaceholder')}
              />
            </div>
          </div>
          {invoiceFeedback && (
            <p className={`text-sm ${invoiceFeedback.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {invoiceFeedback.text}
            </p>
          )}
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              setInvoiceFeedback(null);
              saveInvoiceMutation.mutate();
            }}
            disabled={saveInvoiceMutation.isPending}
          >
            {saveInvoiceMutation.isPending ? <Spinner /> : t('admin.settings.saveInvoice')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-5 w-5" />
            {t('admin.settings.guide')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 p-4">
              <p className="font-semibold text-slate-800">{t('admin.settings.companyOps')}</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-slate-500">
                {guideItems.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-100 p-4">
              <p className="font-semibold text-slate-800">{t('admin.settings.aiBilling')}</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-slate-500">
                {billingItems.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
              <a
                href="https://platform.openai.com/usage"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-teal-600 hover:underline"
              >
                {t('admin.settings.openaiUsage')} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
          <p className="text-xs text-slate-400">{t('admin.settings.envNote')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
