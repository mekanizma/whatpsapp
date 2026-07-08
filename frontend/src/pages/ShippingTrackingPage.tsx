/**
 * E-ticaret kargo takibi
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck, Plus, ExternalLink } from 'lucide-react';
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
import type { EcommerceShipment } from '@/types';

const SHIPMENT_STATUSES: EcommerceShipment['status'][] = [
  'label_created',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'returned',
  'exception',
];

const statusBadge: Record<EcommerceShipment['status'], 'default' | 'info' | 'warning' | 'success' | 'danger'> = {
  label_created: 'default',
  in_transit: 'info',
  out_for_delivery: 'warning',
  delivered: 'success',
  returned: 'danger',
  exception: 'danger',
};

export function ShippingTrackingPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [lastEvent, setLastEvent] = useState('');

  const { data: shipments, isPending } = useQuery({
    queryKey: ['ecommerce-shipments'],
    queryFn: () => api.get<EcommerceShipment[]>('/ecommerce/shipments'),
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<EcommerceShipment>('/ecommerce/shipments', {
        tracking_number: trackingNumber,
        order_number: orderNumber || null,
        carrier: carrier || null,
        tracking_url: trackingUrl || null,
        customer_phone: customerPhone || null,
        last_event: lastEvent || null,
        status: 'label_created',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ecommerce-shipments'] });
      setShowForm(false);
      setTrackingNumber('');
      setOrderNumber('');
      setCarrier('');
      setTrackingUrl('');
      setCustomerPhone('');
      setLastEvent('');
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: EcommerceShipment['status'] }) =>
      api.patch<EcommerceShipment>(`/ecommerce/shipments/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ecommerce-shipments'] }),
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
        title={t('ecommerce.shipping.title')}
        description={t('ecommerce.shipping.description')}
        action={
          <Button type="button" className="w-full sm:w-auto" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" />
            {t('ecommerce.shipping.add')}
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <div className="space-y-1.5">
              <Label htmlFor="tracking-number">{t('ecommerce.shipping.trackingNumber')}</Label>
              <Input
                id="tracking-number"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ship-order">{t('ecommerce.orderStatus.orderNumber')}</Label>
              <Input id="ship-order" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="carrier">{t('ecommerce.shipping.carrier')}</Label>
              <Input id="carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ship-phone">{t('ecommerce.common.phone')}</Label>
              <Input
                id="ship-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                inputMode="tel"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tracking-url">{t('ecommerce.shipping.trackingUrl')}</Label>
              <Input
                id="tracking-url"
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                inputMode="url"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="last-event">{t('ecommerce.shipping.lastEvent')}</Label>
              <Textarea id="last-event" value={lastEvent} onChange={(e) => setLastEvent(e.target.value)} rows={2} />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button
                type="button"
                className="flex-1 sm:flex-none"
                disabled={!trackingNumber.trim() || createMutation.isPending}
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
      ) : !shipments?.length ? (
        <EmptyState
          icon={Truck}
          title={t('ecommerce.shipping.empty')}
          description={t('ecommerce.shipping.emptyDesc')}
        />
      ) : (
        <div className="space-y-3">
          {shipments.map((shipment) => (
            <Card key={shipment.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{shipment.tracking_number}</h3>
                    <Badge variant={statusBadge[shipment.status]}>
                      {t(`ecommerce.shipmentStatuses.${shipment.status}`)}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">
                    {[shipment.carrier, shipment.order_number && `#${shipment.order_number}`]
                      .filter(Boolean)
                      .join(' · ') || t('ecommerce.common.noCustomer')}
                  </p>
                  {shipment.last_event && (
                    <p className="text-xs text-slate-500 sm:text-sm">{shipment.last_event}</p>
                  )}
                  {shipment.tracking_url && (
                    <a
                      href={shipment.tracking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-primary sm:min-h-0"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t('ecommerce.shipping.openTracking')}
                    </a>
                  )}
                  <p className="text-xs text-slate-400">{formatDate(shipment.updated_at)}</p>
                </div>
                <select
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm sm:w-48"
                  value={shipment.status}
                  disabled={patchMutation.isPending}
                  onChange={(e) =>
                    patchMutation.mutate({
                      id: shipment.id,
                      status: e.target.value as EcommerceShipment['status'],
                    })
                  }
                >
                  {SHIPMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`ecommerce.shipmentStatuses.${s}`)}
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
