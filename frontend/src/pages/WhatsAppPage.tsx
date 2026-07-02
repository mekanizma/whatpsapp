/**
 * WhatsApp bağlantı sayfası
 * Yerel: QR (Baileys) | Vercel: Meta Cloud API
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Smartphone, Wifi, WifiOff, QrCode, Send, Unplug, Cloud, Copy, Check,
} from 'lucide-react';
import { api } from '@/services/api';
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, Spinner, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

interface QrSession {
  id: string;
  session_token: string;
  qr_data_url: string;
  status: 'pending' | 'scanned' | 'connected' | 'expired' | 'failed';
  phone_number: string | null;
  display_name: string | null;
  expires_at: string;
}

interface WaStatus {
  status: string;
  phone_number: string | null;
  is_configured: boolean;
  connection_type?: string | null;
  supports_qr?: boolean;
  webhook_url?: string | null;
  reconnecting?: boolean;
}

interface WaConfig {
  phone_number: string | null;
  business_account_id: string | null;
  status: string;
}

export function WhatsAppPage() {
  const { t } = useTranslation();
  const [session, setSession] = useState<QrSession | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testFeedback, setTestFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [cloudForm, setCloudForm] = useState({
    phone_number: '',
    business_account_id: '',
    access_token: '',
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    setTestMessage(t('whatsapp.defaultTestMsg'));
  }, [t]);

  const { data: status } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: () => api.get<WaStatus>('/whatsapp/status'),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (session && session.status !== 'connected' && session.status !== 'expired') {
        return false;
      }
      if (data?.status === 'connected') return false;
      return data?.status === 'reconnecting' ? 8000 : 10000;
    },
  });

  const { data: config } = useQuery({
    queryKey: ['whatsapp-config'],
    queryFn: () => api.get<WaConfig>('/whatsapp/config'),
    enabled: status?.supports_qr === false,
  });

  useEffect(() => {
    if (config) {
      setCloudForm((f) => ({
        ...f,
        phone_number: config.phone_number || '',
        business_account_id: config.business_account_id || '',
      }));
    }
  }, [config]);

  const isReconnecting = status?.status === 'reconnecting' || status?.reconnecting === true;
  const isConnected = status?.status === 'connected';
  const useCloudApi = status?.supports_qr === false;
  const webhookUrl = status?.webhook_url || `${window.location.origin}/webhook/whatsapp`;
  const webhookSteps = t('whatsapp.webhookSteps', { returnObjects: true }) as string[];

  const startQrMutation = useMutation({
    mutationFn: () => api.post<QrSession>('/whatsapp/qr/start'),
    onSuccess: (data) => {
      setSession(data);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
    },
  });

  const cloudConnectMutation = useMutation({
    mutationFn: () =>
      api.put('/whatsapp/config', {
        phone_number: cloudForm.phone_number,
        business_account_id: cloudForm.business_account_id,
        access_token: cloudForm.access_token,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-config'] });
    },
  });

  const pollQrStatus = useCallback(async () => {
    if (!session || session.status === 'connected' || session.status === 'expired' || session.status === 'failed') return;
    try {
      const data = await api.get<QrSession>(`/whatsapp/qr/${session.session_token}/status`);
      setSession(data);
      if (data.status === 'connected') {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('429') || message.includes('Çok fazla istek')) {
        return;
      }
    }
  }, [session, queryClient]);

  useEffect(() => {
    if (!session || session.status === 'connected' || session.status === 'expired' || session.status === 'failed') return;
    const interval = setInterval(pollQrStatus, 3500);
    pollQrStatus();
    return () => clearInterval(interval);
  }, [session, pollQrStatus]);

  const disconnectMutation = useMutation({
    mutationFn: () => api.post('/whatsapp/disconnect'),
    onSuccess: () => {
      setSession(null);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => api.post('/whatsapp/test', { to_phone: testPhone, message: testMessage }),
    onSuccess: () => setTestFeedback({ type: 'success', text: t('whatsapp.testSent') }),
    onError: (err) => setTestFeedback({ type: 'error', text: (err as Error).message }),
  });

  const cancelQr = async () => {
    if (session) {
      await api.delete(`/whatsapp/qr/${session.session_token}`);
      setSession(null);
    }
  };

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('whatsapp.title')}</h1>
          <p className="text-gray-500">
            {useCloudApi ? t('whatsapp.cloudApiDesc') : t('whatsapp.description')}
          </p>
        </div>
        {isConnected ? (
          <Badge variant="success" className="self-start px-3 py-1.5 text-sm">
            <Wifi className="mr-1 h-4 w-4" /> {t('whatsapp.connected')}
          </Badge>
        ) : isReconnecting ? (
          <Badge variant="warning" className="self-start px-3 py-1.5 text-sm">
            <Wifi className="mr-1 h-4 w-4 animate-pulse" /> {t('whatsapp.reconnecting')}
          </Badge>
        ) : (
          <Badge variant="danger" className="self-start px-3 py-1.5 text-sm">
            <WifiOff className="mr-1 h-4 w-4" /> {t('whatsapp.disconnected')}
          </Badge>
        )}
      </div>

      {isReconnecting && !session ? (
        <Card>
          <CardContent className="space-y-4 p-6 text-center sm:text-left">
            <div>
              <p className="font-medium text-amber-800">{t('whatsapp.reconnectingTitle')}</p>
              <p className="mt-2 text-sm text-gray-600">{t('whatsapp.reconnectingDesc')}</p>
            </div>
            <div className="border-t border-amber-100 pt-4">
              <p className="mb-3 text-sm text-gray-500">{t('whatsapp.reconnectWithQrHint')}</p>
              <Button
                className="w-full sm:w-auto"
                onClick={() => startQrMutation.mutate()}
                disabled={startQrMutation.isPending}
              >
                {startQrMutation.isPending ? (
                  <span className="flex items-center gap-2"><Spinner /> {t('whatsapp.generatingQr')}</span>
                ) : (
                  <>
                    <QrCode className="h-4 w-4" />
                    {t('whatsapp.reconnectWithQr')}
                  </>
                )}
              </Button>
              {startQrMutation.isError && (
                <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {(startQrMutation.error as Error).message}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : isConnected ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Smartphone className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-semibold">{status?.phone_number}</p>
                  <p className="text-sm text-gray-500">
                    {status?.connection_type === 'qr' ? t('whatsapp.qrConnected') : t('whatsapp.cloudConnected')}
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
                <Unplug className="h-4 w-4" />
                {t('whatsapp.disconnect')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : useCloudApi ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5" />
                {t('whatsapp.cloudApi')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('whatsapp.businessPhone')}</Label>
                <Input
                  value={cloudForm.phone_number}
                  onChange={(e) => setCloudForm({ ...cloudForm, phone_number: e.target.value })}
                  placeholder={t('whatsapp.phonePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('whatsapp.phoneNumberId')}</Label>
                <Input
                  value={cloudForm.business_account_id}
                  onChange={(e) => setCloudForm({ ...cloudForm, business_account_id: e.target.value })}
                  placeholder={t('whatsapp.phoneNumberIdPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('whatsapp.accessToken')}</Label>
                <Input
                  type="password"
                  value={cloudForm.access_token}
                  onChange={(e) => setCloudForm({ ...cloudForm, access_token: e.target.value })}
                  placeholder={t('whatsapp.accessTokenPlaceholder')}
                />
              </div>
              {cloudConnectMutation.isError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {(cloudConnectMutation.error as Error).message}
                </div>
              )}
              <Button
                className="w-full"
                onClick={() => cloudConnectMutation.mutate()}
                disabled={cloudConnectMutation.isPending || !cloudForm.access_token}
              >
                {cloudConnectMutation.isPending ? <Spinner /> : t('whatsapp.connectCloud')}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t('whatsapp.webhookTitle')}</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm text-gray-600">
              <p>{t('whatsapp.webhookDesc')}</p>
              <div className="space-y-2">
                <Label>{t('whatsapp.callbackUrl')}</Label>
                <div className="flex gap-2">
                  <Input readOnly value={webhookUrl} className="text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={copyWebhook}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="font-medium">{t('whatsapp.verifyToken')}</p>
                <p className="mt-1">{t('whatsapp.webhookHint')}</p>
              </div>
              <ol className="list-inside list-decimal space-y-1">
                {webhookSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                {session ? t('whatsapp.qrConnect') : t('whatsapp.reconnectWithQr')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-4">
              {!session ? (
                <>
                  <div className="flex h-48 w-48 items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50">
                    <QrCode className="h-16 w-16 text-gray-300" />
                  </div>
                  {startQrMutation.isError && (
                    <div className="w-full max-w-xs rounded-lg bg-red-50 p-3 text-sm text-red-600">
                      {(startQrMutation.error as Error).message}
                    </div>
                  )}
                  <Button onClick={() => startQrMutation.mutate()} disabled={startQrMutation.isPending} className="w-full max-w-xs">
                    {startQrMutation.isPending ? (
                      <span className="flex items-center gap-2"><Spinner /> {t('whatsapp.generatingQr')}</span>
                    ) : (
                      t('whatsapp.reconnectWithQr')
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <img src={session.qr_data_url} alt="WhatsApp QR" className="h-56 w-56 rounded-2xl border-2 p-3" />
                  <StatusLabel status={session.status} />
                  <div className="flex w-full max-w-xs gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => startQrMutation.mutate()}>{t('whatsapp.refresh')}</Button>
                    <Button variant="ghost" className="flex-1" onClick={cancelQr}>{t('common.cancel')}</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t('whatsapp.howItWorks')}</CardTitle></CardHeader>
            <CardContent className="text-sm text-gray-600">
              <p>{t('whatsapp.howItWorksDesc')}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {isConnected && (
        <Card>
          <CardHeader><CardTitle>{t('whatsapp.testMessage')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('whatsapp.recipientPhone')}</Label>
                <Input value={testPhone} onChange={(e) => { setTestPhone(e.target.value); setTestFeedback(null); }} placeholder="905551234567" />
              </div>
              <div className="space-y-2">
                <Label>{t('whatsapp.message')}</Label>
                <Input value={testMessage} onChange={(e) => setTestMessage(e.target.value)} />
              </div>
            </div>
            {testFeedback && (
              <div className={cn('rounded-lg p-3 text-sm', testFeedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>
                {testFeedback.text}
              </div>
            )}
            <Button onClick={() => { setTestFeedback(null); testMutation.mutate(); }} disabled={!testPhone || testMutation.isPending}>
              <Send className="h-4 w-4" />
              {testMutation.isPending ? t('whatsapp.sending') : t('whatsapp.sendTest')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusLabel({ status }: { status: string }) {
  const { t } = useTranslation();
  const keys: Record<string, string> = {
    pending: 'whatsapp.qrScan',
    scanned: 'whatsapp.qrConnecting',
    connected: 'whatsapp.qrSuccess',
    expired: 'whatsapp.qrExpired',
    failed: 'whatsapp.qrFailed',
  };
  const colorMap: Record<string, string> = {
    pending: 'text-gray-600',
    scanned: 'text-primary',
    connected: 'text-green-600',
    expired: 'text-red-600',
    failed: 'text-red-600',
  };
  const key = keys[status] || keys.pending;
  return <p className={cn('font-medium', colorMap[status] || colorMap.pending)}>{t(key)}</p>;
}
