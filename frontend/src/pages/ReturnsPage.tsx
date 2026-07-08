/**
 * E-ticaret iade ve değişim
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCcw, Plus } from 'lucide-react';
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
import type { EcommerceReturnRequest, EcommerceSettings } from '@/types';

const RETURN_STATUSES: EcommerceReturnRequest['status'][] = [
  'requested',
  'approved',
  'rejected',
  'in_transit',
  'received',
  'refunded',
  'completed',
  'cancelled',
];

const statusBadge: Record<
  EcommerceReturnRequest['status'],
  'default' | 'info' | 'warning' | 'success' | 'danger'
> = {
  requested: 'info',
  approved: 'success',
  rejected: 'danger',
  in_transit: 'warning',
  received: 'info',
  refunded: 'success',
  completed: 'success',
  cancelled: 'default',
};

export function ReturnsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [requestType, setRequestType] = useState<EcommerceReturnRequest['request_type']>('return');
  const [reason, setReason] = useState('');
  const [itemsSummary, setItemsSummary] = useState('');
  const [policyText, setPolicyText] = useState('');

  const { data: settings } = useQuery({
    queryKey: ['ecommerce-settings'],
    queryFn: () => api.get<EcommerceSettings>('/ecommerce/settings'),
  });

  const { data: returns, isPending } = useQuery({
    queryKey: ['ecommerce-returns'],
    queryFn: () => api.get<EcommerceReturnRequest[]>('/ecommerce/returns'),
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<EcommerceReturnRequest>('/ecommerce/returns', {
        order_number: orderNumber || null,
        customer_phone: customerPhone || null,
        customer_name: customerName || null,
        request_type: requestType,
        reason: reason || null,
        items_summary: itemsSummary || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ecommerce-returns'] });
      setShowForm(false);
      setOrderNumber('');
      setCustomerPhone('');
      setCustomerName('');
      setRequestType('return');
      setReason('');
      setItemsSummary('');
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: EcommerceReturnRequest['status'] }) =>
      api.patch<EcommerceReturnRequest>(`/ecommerce/returns/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ecommerce-returns'] }),
  });

  const policyMutation = useMutation({
    mutationFn: (return_policy_text: string) =>
      api.put<EcommerceSettings>('/ecommerce/settings', {
        return_policy_text,
        store_name: settings?.store_name,
        store_url: settings?.store_url,
        provider: settings?.provider || 'manual',
        returns_enabled: true,
      }),
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
        title={t('ecommerce.returns.title')}
        description={t('ecommerce.returns.description')}
        action={
          <Button type="button" className="w-full sm:w-auto" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" />
            {t('ecommerce.returns.add')}
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div>
            <p className="text-sm font-medium text-slate-800">{t('ecommerce.returns.policyTitle')}</p>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">{t('ecommerce.returns.policyHint')}</p>
          </div>
          <Textarea
            value={policyText || settings?.return_policy_text || ''}
            onChange={(e) => setPolicyText(e.target.value)}
            rows={4}
            placeholder={t('ecommerce.returns.policyPlaceholder')}
          />
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={policyMutation.isPending}
            onClick={() =>
              policyMutation.mutate(policyText || settings?.return_policy_text || '')
            }
          >
            {policyMutation.isPending ? <Spinner className="h-4 w-4" /> : t('ecommerce.returns.savePolicy')}
          </Button>
        </CardContent>
      </Card>

      {showForm && (
        <Card>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <div className="space-y-1.5">
              <Label htmlFor="ret-order">{t('ecommerce.orderStatus.orderNumber')}</Label>
              <Input id="ret-order" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ret-type">{t('ecommerce.returns.requestType')}</Label>
              <select
                id="ret-type"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                value={requestType}
                onChange={(e) => setRequestType(e.target.value as EcommerceReturnRequest['request_type'])}
              >
                <option value="return">{t('ecommerce.returnTypes.return')}</option>
                <option value="exchange">{t('ecommerce.returnTypes.exchange')}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ret-phone">{t('ecommerce.common.phone')}</Label>
              <Input
                id="ret-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                inputMode="tel"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ret-name">{t('ecommerce.common.customerName')}</Label>
              <Input id="ret-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ret-items">{t('ecommerce.common.items')}</Label>
              <Textarea id="ret-items" value={itemsSummary} onChange={(e) => setItemsSummary(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ret-reason">{t('ecommerce.returns.reason')}</Label>
              <Textarea id="ret-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
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
      ) : !returns?.length ? (
        <EmptyState
          icon={RefreshCcw}
          title={t('ecommerce.returns.empty')}
          description={t('ecommerce.returns.emptyDesc')}
        />
      ) : (
        <div className="space-y-3">
          {returns.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">
                      {item.order_number ? `#${item.order_number}` : t(`ecommerce.returnTypes.${item.request_type}`)}
                    </h3>
                    <Badge variant="default">{t(`ecommerce.returnTypes.${item.request_type}`)}</Badge>
                    <Badge variant={statusBadge[item.status]}>
                      {t(`ecommerce.returnStatuses.${item.status}`)}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">
                    {item.customer_name || item.customer_phone || t('ecommerce.common.noCustomer')}
                  </p>
                  {item.reason && <p className="text-xs text-slate-500 sm:text-sm">{item.reason}</p>}
                  <p className="text-xs text-slate-400">{formatDate(item.created_at)}</p>
                </div>
                <select
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm sm:w-48"
                  value={item.status}
                  disabled={patchMutation.isPending}
                  onChange={(e) =>
                    patchMutation.mutate({
                      id: item.id,
                      status: e.target.value as EcommerceReturnRequest['status'],
                    })
                  }
                >
                  {RETURN_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`ecommerce.returnStatuses.${s}`)}
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
