/**
 * E-ticaret sepet (terkedilmiş sepet) yönetimi
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShoppingCart, Plus } from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Spinner,
  Textarea,
} from '@/components/ui';
import type { EcommerceCart, EcommerceSettings } from '@/types';

const CART_STATUSES: EcommerceCart['status'][] = ['abandoned', 'reminded', 'recovered', 'expired'];

const statusBadge: Record<EcommerceCart['status'], 'default' | 'info' | 'warning' | 'success'> = {
  abandoned: 'warning',
  reminded: 'info',
  recovered: 'success',
  expired: 'default',
};

export function CartPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [itemsSummary, setItemsSummary] = useState('');
  const [cartTotal, setCartTotal] = useState('');
  const [itemCount, setItemCount] = useState('1');

  const { data: settings } = useQuery({
    queryKey: ['ecommerce-settings'],
    queryFn: () => api.get<EcommerceSettings>('/ecommerce/settings'),
  });

  const { data: carts, isPending } = useQuery({
    queryKey: ['ecommerce-carts'],
    queryFn: () => api.get<EcommerceCart[]>('/ecommerce/carts'),
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<EcommerceCart>('/ecommerce/carts', {
        customer_phone: customerPhone || null,
        customer_name: customerName || null,
        items_summary: itemsSummary || null,
        cart_total: cartTotal ? Number(cartTotal) : null,
        item_count: itemCount ? Number(itemCount) : 0,
        status: 'abandoned',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ecommerce-carts'] });
      setShowForm(false);
      setCustomerPhone('');
      setCustomerName('');
      setItemsSummary('');
      setCartTotal('');
      setItemCount('1');
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: EcommerceCart['status'] }) =>
      api.patch<EcommerceCart>(`/ecommerce/carts/${id}`, {
        status,
        reminded_at: status === 'reminded' ? new Date().toISOString() : undefined,
        recovered_at: status === 'recovered' ? new Date().toISOString() : undefined,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ecommerce-carts'] }),
  });

  const settingsMutation = useMutation({
    mutationFn: (hours: number) =>
      api.put<EcommerceSettings>('/ecommerce/settings', { cart_reminder_hours: hours }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ecommerce-settings'] }),
  });

  const formatDate = (value: string) =>
    new Date(value).toLocaleString(locale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title={t('ecommerce.cart.title')}
        description={t('ecommerce.cart.description')}
        action={
          <Button type="button" className="w-full sm:w-auto" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" />
            {t('ecommerce.cart.add')}
          </Button>
        }
      />

      {settings && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-800">{t('ecommerce.cart.reminderHours')}</p>
              <p className="text-xs text-slate-500 sm:text-sm">{t('ecommerce.cart.reminderHint')}</p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Input
                type="number"
                min={1}
                className="w-full sm:w-28"
                defaultValue={settings.cart_reminder_hours}
                onBlur={(e) => {
                  const hours = Number(e.target.value);
                  if (hours > 0 && hours !== settings.cart_reminder_hours) {
                    settingsMutation.mutate(hours);
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <div className="space-y-1.5">
              <Label htmlFor="cart-phone">{t('ecommerce.common.phone')}</Label>
              <Input
                id="cart-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                inputMode="tel"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cart-name">{t('ecommerce.common.customerName')}</Label>
              <Input id="cart-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cart-total">{t('ecommerce.cart.total')}</Label>
              <Input
                id="cart-total"
                value={cartTotal}
                onChange={(e) => setCartTotal(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cart-count">{t('ecommerce.cart.itemCount')}</Label>
              <Input
                id="cart-count"
                value={itemCount}
                onChange={(e) => setItemCount(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cart-items">{t('ecommerce.common.items')}</Label>
              <Textarea
                id="cart-items"
                value={itemsSummary}
                onChange={(e) => setItemsSummary(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button
                type="button"
                className="flex-1 sm:flex-none"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? <Spinner className="h-4 w-4" /> : t('common.save')}
              </Button>
              <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={() => setShowForm(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isPending ? (
        <div className="flex justify-center p-12"><Spinner className="h-8 w-8" /></div>
      ) : !carts?.length ? (
        <EmptyState
          icon={ShoppingCart}
          title={t('ecommerce.cart.empty')}
          description={t('ecommerce.cart.emptyDesc')}
        />
      ) : (
        <div className="space-y-3">
          {carts.map((cart) => (
            <Card key={cart.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">
                      {cart.customer_name || cart.customer_phone || t('ecommerce.common.noCustomer')}
                    </h3>
                    <Badge variant={statusBadge[cart.status]}>
                      {t(`ecommerce.cartStatuses.${cart.status}`)}
                    </Badge>
                  </div>
                  {cart.items_summary && (
                    <p className="text-xs text-slate-500 sm:text-sm">{cart.items_summary}</p>
                  )}
                  <p className="text-xs text-slate-500">
                    {cart.item_count} {t('ecommerce.cart.items')}
                    {cart.cart_total != null ? ` · ${cart.cart_total} ${cart.currency}` : ''}
                  </p>
                  <p className="text-xs text-slate-400">{formatDate(cart.abandoned_at)}</p>
                </div>
                <select
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm sm:w-44"
                  value={cart.status}
                  disabled={patchMutation.isPending}
                  onChange={(e) =>
                    patchMutation.mutate({
                      id: cart.id,
                      status: e.target.value as EcommerceCart['status'],
                    })
                  }
                >
                  {CART_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`ecommerce.cartStatuses.${s}`)}
                    </option>
                  ))}
                </select>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
