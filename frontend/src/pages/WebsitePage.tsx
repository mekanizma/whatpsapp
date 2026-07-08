/**
 * Web sitesi API bağlantısı — E-ticaret paketi
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Plug, CheckCircle2, XCircle, Save } from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Spinner,
} from '@/components/ui';
import type { EcommerceSettings } from '@/types';

type FormState = {
  store_name: string;
  store_url: string;
  provider: EcommerceSettings['provider'];
  api_base_url: string;
  api_key: string;
  api_enabled: boolean;
  api_auth_type: EcommerceSettings['api_auth_type'];
  api_auth_header_name: string;
  products_path: string;
  product_search_path: string;
  stock_path: string;
  order_status_path: string;
  shipping_path: string;
};

const emptyForm: FormState = {
  store_name: '',
  store_url: '',
  provider: 'custom',
  api_base_url: '',
  api_key: '',
  api_enabled: false,
  api_auth_type: 'bearer',
  api_auth_header_name: 'Authorization',
  products_path: '/products',
  product_search_path: '/products/search',
  stock_path: '/products/{sku}/stock',
  order_status_path: '/orders/{orderNumber}',
  shipping_path: '/shipping/{trackingNumber}',
};

export function WebsitePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const { data: settings, isPending } = useQuery({
    queryKey: ['ecommerce-settings'],
    queryFn: () => api.get<EcommerceSettings>('/ecommerce/settings'),
  });

  useEffect(() => {
    if (!settings) return;
    setForm({
      store_name: settings.store_name || '',
      store_url: settings.store_url || '',
      provider: settings.provider || 'custom',
      api_base_url: settings.api_base_url || '',
      api_key: settings.api_key || '',
      api_enabled: Boolean(settings.api_enabled),
      api_auth_type: settings.api_auth_type || 'bearer',
      api_auth_header_name: settings.api_auth_header_name || 'Authorization',
      products_path: settings.products_path || '/products',
      product_search_path: settings.product_search_path || '/products/search',
      stock_path: settings.stock_path || '/products/{sku}/stock',
      order_status_path: settings.order_status_path || '/orders/{orderNumber}',
      shipping_path: settings.shipping_path || '/shipping/{trackingNumber}',
    });
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put<EcommerceSettings>('/ecommerce/settings', {
        store_name: form.store_name || null,
        store_url: form.store_url || null,
        provider: form.provider,
        api_base_url: form.api_base_url || null,
        api_key: form.api_key || null,
        api_enabled: form.api_enabled,
        api_auth_type: form.api_auth_type,
        api_auth_header_name: form.api_auth_header_name || 'Authorization',
        products_path: form.products_path || '/products',
        product_search_path: form.product_search_path || '/products/search',
        stock_path: form.stock_path || '/products/{sku}/stock',
        order_status_path: form.order_status_path || '/orders/{orderNumber}',
        shipping_path: form.shipping_path || '/shipping/{trackingNumber}',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ecommerce-settings'] });
      setMsg({ type: 'ok', text: t('ecommerce.website.saved') });
    },
    onError: (err: Error) => setMsg({ type: 'err', text: err.message }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      await api.put('/ecommerce/settings', {
        store_name: form.store_name || null,
        store_url: form.store_url || null,
        provider: form.provider,
        api_base_url: form.api_base_url || null,
        api_key: form.api_key || null,
        api_enabled: form.api_enabled,
        api_auth_type: form.api_auth_type,
        api_auth_header_name: form.api_auth_header_name || 'Authorization',
        products_path: form.products_path || '/products',
        product_search_path: form.product_search_path || '/products/search',
        stock_path: form.stock_path || '/products/{sku}/stock',
        order_status_path: form.order_status_path || '/orders/{orderNumber}',
        shipping_path: form.shipping_path || '/shipping/{trackingNumber}',
      });
      return api.post<{
        settings: EcommerceSettings;
        test: { ok: boolean; message: string; sampleProductCount?: number };
      }>('/ecommerce/settings/test');
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ecommerce-settings'] });
      setMsg({
        type: data.test.ok ? 'ok' : 'err',
        text: data.test.ok
          ? t('ecommerce.website.testOk', { count: data.test.sampleProductCount ?? 0 })
          : data.test.message || t('ecommerce.website.testFail'),
      });
      if (data.settings) {
        setForm((prev) => ({ ...prev, api_enabled: Boolean(data.settings.api_enabled) }));
      }
    },
    onError: (err: Error) => setMsg({ type: 'err', text: err.message }),
  });

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const connected = Boolean(settings?.api_enabled && settings?.last_test_status === 'ok');

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title={t('ecommerce.website.title')}
        description={t('ecommerce.website.description')}
        action={
          connected ? (
            <Badge variant="success" className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('ecommerce.website.connected')}
            </Badge>
          ) : (
            <Badge variant="default" className="inline-flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5" />
              {t('ecommerce.website.notConnected')}
            </Badge>
          )
        }
      />

      {isPending ? (
        <div className="flex justify-center p-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="space-y-1 p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Globe className="h-5 w-5 text-primary" />
                {t('ecommerce.website.storeSection')}
              </CardTitle>
              <CardDescription>{t('ecommerce.website.storeSectionDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 pt-0 sm:grid-cols-2 sm:p-6 sm:pt-0">
              <div className="space-y-1.5">
                <Label htmlFor="store-name">{t('ecommerce.website.storeName')}</Label>
                <Input
                  id="store-name"
                  value={form.store_name}
                  onChange={(e) => setField('store_name', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-url">{t('ecommerce.website.storeUrl')}</Label>
                <Input
                  id="store-url"
                  value={form.store_url}
                  onChange={(e) => setField('store_url', e.target.value)}
                  inputMode="url"
                  placeholder="https://magaza.com"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="provider">{t('ecommerce.website.provider')}</Label>
                <select
                  id="provider"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  value={form.provider}
                  onChange={(e) => setField('provider', e.target.value as FormState['provider'])}
                >
                  <option value="custom">{t('ecommerce.website.providers.custom')}</option>
                  <option value="shopify">{t('ecommerce.website.providers.shopify')}</option>
                  <option value="woocommerce">{t('ecommerce.website.providers.woocommerce')}</option>
                  <option value="manual">{t('ecommerce.website.providers.manual')}</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1 p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Plug className="h-5 w-5 text-primary" />
                {t('ecommerce.website.apiSection')}
              </CardTitle>
              <CardDescription>{t('ecommerce.website.apiSectionDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 pt-0 sm:grid-cols-2 sm:p-6 sm:pt-0">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="api-base">{t('ecommerce.website.apiBaseUrl')}</Label>
                <Input
                  id="api-base"
                  value={form.api_base_url}
                  onChange={(e) => setField('api_base_url', e.target.value)}
                  inputMode="url"
                  placeholder="https://magaza.com/api/v1"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="api-key">{t('ecommerce.website.apiKey')}</Label>
                <Input
                  id="api-key"
                  type="password"
                  value={form.api_key}
                  onChange={(e) => setField('api_key', e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auth-type">{t('ecommerce.website.authType')}</Label>
                <select
                  id="auth-type"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  value={form.api_auth_type}
                  onChange={(e) =>
                    setField('api_auth_type', e.target.value as FormState['api_auth_type'])
                  }
                >
                  <option value="bearer">{t('ecommerce.website.authTypes.bearer')}</option>
                  <option value="api_key">{t('ecommerce.website.authTypes.api_key')}</option>
                  <option value="header">{t('ecommerce.website.authTypes.header')}</option>
                </select>
              </div>
              {form.api_auth_type === 'header' && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="auth-header">{t('ecommerce.website.authHeader')}</Label>
                  <Input
                    id="auth-header"
                    value={form.api_auth_header_name}
                    onChange={(e) => setField('api_auth_header_name', e.target.value)}
                  />
                </div>
              )}

              <label className="flex min-h-[44px] items-center gap-3 sm:col-span-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={form.api_enabled}
                  onChange={(e) => setField('api_enabled', e.target.checked)}
                />
                <span className="text-sm text-slate-700">{t('ecommerce.website.enableApi')}</span>
              </label>

              <div className="space-y-1.5">
                <Label htmlFor="products-path">{t('ecommerce.website.productsPath')}</Label>
                <Input
                  id="products-path"
                  value={form.products_path}
                  onChange={(e) => setField('products_path', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="search-path">{t('ecommerce.website.searchPath')}</Label>
                <Input
                  id="search-path"
                  value={form.product_search_path}
                  onChange={(e) => setField('product_search_path', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stock-path">{t('ecommerce.website.stockPath')}</Label>
                <Input
                  id="stock-path"
                  value={form.stock_path}
                  onChange={(e) => setField('stock_path', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="order-path">{t('ecommerce.website.orderPath')}</Label>
                <Input
                  id="order-path"
                  value={form.order_status_path}
                  onChange={(e) => setField('order_status_path', e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ship-path">{t('ecommerce.website.shippingPath')}</Label>
                <Input
                  id="ship-path"
                  value={form.shipping_path}
                  onChange={(e) => setField('shipping_path', e.target.value)}
                />
              </div>

              {settings?.last_test_at && (
                <p className="text-xs text-slate-500 sm:col-span-2">
                  {t('ecommerce.website.lastTest')}:{' '}
                  {settings.last_test_status === 'ok'
                    ? t('ecommerce.website.connected')
                    : settings.last_test_message || t('ecommerce.website.testFail')}
                </p>
              )}

              {msg && (
                <p
                  className={`text-sm sm:col-span-2 ${
                    msg.type === 'ok' ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {msg.text}
                </p>
              )}

              <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={saveMutation.isPending}
                  onClick={() => {
                    setMsg(null);
                    saveMutation.mutate();
                  }}
                >
                  {saveMutation.isPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  {t('common.save')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={!form.api_base_url.trim() || testMutation.isPending}
                  onClick={() => {
                    setMsg(null);
                    testMutation.mutate();
                  }}
                >
                  {testMutation.isPending ? <Spinner className="h-4 w-4" /> : <Plug className="h-4 w-4" />}
                  {t('ecommerce.website.testConnection')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4 text-sm text-slate-600 sm:p-5">
              <p className="font-medium text-slate-800">{t('ecommerce.website.howTitle')}</p>
              <p>{t('ecommerce.website.howDesc')}</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
