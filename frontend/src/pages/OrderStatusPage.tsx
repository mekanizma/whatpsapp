/**
 * E-ticaret sipariş durumu sorgulama
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageSearch, Plus } from 'lucide-react';
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
import type { EcommerceOrder, EcommerceSettings } from '@/types';

const ORDER_STATUSES: EcommerceOrder['status'][] = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
];

const statusBadge: Record<EcommerceOrder['status'], 'default' | 'info' | 'warning' | 'success' | 'danger'> = {
  pending: 'default',
  confirmed: 'info',
  processing: 'warning',
  shipped: 'info',
  delivered: 'success',
  cancelled: 'danger',
  refunded: 'danger',
};

export function OrderStatusPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [itemsSummary, setItemsSummary] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [status, setStatus] = useState<EcommerceOrder['status']>('pending');

  const { data: settings } = useQuery({
    queryKey: ['ecommerce-settings'],
    queryFn: () => api.get<EcommerceSettings>('/ecommerce/settings'),
  });

  const { data: orders, isPending } = useQuery({
    queryKey: ['ecommerce-orders'],
    queryFn: () => api.get<EcommerceOrder[]>('/ecommerce/orders'),
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<EcommerceOrder>('/ecommerce/orders', {
        order_number: orderNumber,
        customer_phone: customerPhone || null,
        customer_name: customerName || null,
        items_summary: itemsSummary || null,
        total_amount: totalAmount ? Number(totalAmount) : null,
        status,
        payment_status: 'paid',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ecommerce-orders'] });
      setShowForm(false);
      setOrderNumber('');
      setCustomerPhone('');
      setCustomerName('');
      setItemsSummary('');
      setTotalAmount('');
      setStatus('pending');
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, nextStatus }: { id: string; nextStatus: EcommerceOrder['status'] }) =>
      api.patch<EcommerceOrder>(`/ecommerce/orders/${id}`, { status: nextStatus }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ecommerce-orders'] }),
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
        title={t('ecommerce.orderStatus.title')}
        description={t('ecommerce.orderStatus.description')}
        action={
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus className="h-4 w-4" />
            {t('ecommerce.orderStatus.add')}
          </Button>
        }
      />

      {settings && (
        <Card>
          <CardContent className="space-y-2 p-4 sm:p-5">
            <p className="text-sm font-medium text-slate-800">
              {settings.store_name || t('ecommerce.settings.unnamedStore')}
            </p>
            <p className="text-xs text-slate-500 sm:text-sm">
              {t('ecommerce.orderStatus.aiHint')}
            </p>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="order-number">{t('ecommerce.orderStatus.orderNumber')}</Label>
              <Input
                id="order-number"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="ORD-1001"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order-phone">{t('ecommerce.common.phone')}</Label>
              <Input
                id="order-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                inputMode="tel"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order-name">{t('ecommerce.common.customerName')}</Label>
              <Input
                id="order-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order-total">{t('ecommerce.orderStatus.total')}</Label>
              <Input
                id="order-total"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="order-items">{t('ecommerce.common.items')}</Label>
              <Textarea
                id="order-items"
                value={itemsSummary}
                onChange={(e) => setItemsSummary(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order-status">{t('ecommerce.common.status')}</Label>
              <select
                id="order-status"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as EcommerceOrder['status'])}
              >
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`ecommerce.orderStatuses.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button
                type="button"
                className="flex-1 sm:flex-none"
                disabled={!orderNumber.trim() || createMutation.isPending}
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
      ) : !orders?.length ? (
        <EmptyState
          icon={PackageSearch}
          title={t('ecommerce.orderStatus.empty')}
          description={t('ecommerce.orderStatus.emptyDesc')}
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">#{order.order_number}</h3>
                    <Badge variant={statusBadge[order.status]}>
                      {t(`ecommerce.orderStatuses.${order.status}`)}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">
                    {order.customer_name || order.customer_phone || t('ecommerce.common.noCustomer')}
                  </p>
                  {order.items_summary && (
                    <p className="text-xs text-slate-500 sm:text-sm">{order.items_summary}</p>
                  )}
                  <p className="text-xs text-slate-400">{formatDate(order.ordered_at)}</p>
                </div>
                <select
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm sm:w-44"
                  value={order.status}
                  disabled={patchMutation.isPending}
                  onChange={(e) =>
                    patchMutation.mutate({
                      id: order.id,
                      nextStatus: e.target.value as EcommerceOrder['status'],
                    })
                  }
                >
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`ecommerce.orderStatuses.${s}`)}
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
