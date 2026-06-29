/**
 * WhatsApp bağlantı sayfası
 * Yerel: QR (Baileys) | Vercel: Meta Cloud API
 */

import { useState, useEffect, useCallback } from 'react';
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
}

interface WaConfig {
  phone_number: string | null;
  business_account_id: string | null;
  status: string;
}

export function WhatsAppPage() {
  const [session, setSession] = useState<QrSession | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Merhaba! Test mesajı.');
  const [testFeedback, setTestFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [cloudForm, setCloudForm] = useState({
    phone_number: '',
    business_account_id: '',
    access_token: '',
  });
  const queryClient = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: () => api.get<WaStatus>('/whatsapp/status'),
    refetchInterval: 5000,
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

  const isConnected = status?.is_configured || status?.status === 'connected';
  const useCloudApi = status?.supports_qr === false;
  const webhookUrl = status?.webhook_url || `${window.location.origin}/webhook/whatsapp`;

  const startQrMutation = useMutation({
    mutationFn: () => api.post<QrSession>('/whatsapp/qr/start'),
    onSuccess: (data) => setSession(data),
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
    if (!session || session.status === 'connected' || session.status === 'expired') return;
    try {
      const data = await api.get<QrSession>(`/whatsapp/qr/${session.session_token}/status`);
      setSession(data);
      if (data.status === 'connected') {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
      }
    } catch {
      /* ignore */
    }
  }, [session, queryClient]);

  useEffect(() => {
    if (!session || session.status === 'connected' || session.status === 'expired') return;
    const interval = setInterval(pollQrStatus, 2000);
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
    onSuccess: () => setTestFeedback({ type: 'success', text: 'Test mesajı gönderildi!' }),
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
          <h1 className="text-2xl font-bold">WhatsApp Bağlantısı</h1>
          <p className="text-gray-500">
            {useCloudApi ? 'Meta WhatsApp Cloud API' : 'QR kod ile iş hattınızı bağlayın'}
          </p>
        </div>
        {isConnected ? (
          <Badge variant="success" className="self-start px-3 py-1.5 text-sm">
            <Wifi className="mr-1 h-4 w-4" /> Bağlı
          </Badge>
        ) : (
          <Badge variant="danger" className="self-start px-3 py-1.5 text-sm">
            <WifiOff className="mr-1 h-4 w-4" /> Bağlı Değil
          </Badge>
        )}
      </div>

      {isConnected ? (
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
                    {status?.connection_type === 'qr' ? 'QR ile bağlandı' : 'Cloud API ile bağlandı'}
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
                <Unplug className="h-4 w-4" />
                Bağlantıyı Kes
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
                Meta Cloud API Bağlantısı
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>İş Telefonu</Label>
                <Input
                  value={cloudForm.phone_number}
                  onChange={(e) => setCloudForm({ ...cloudForm, phone_number: e.target.value })}
                  placeholder="+905551234567"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone Number ID</Label>
                <Input
                  value={cloudForm.business_account_id}
                  onChange={(e) => setCloudForm({ ...cloudForm, business_account_id: e.target.value })}
                  placeholder="Meta Developer → WhatsApp → Phone Number ID"
                />
              </div>
              <div className="space-y-2">
                <Label>Access Token</Label>
                <Input
                  type="password"
                  value={cloudForm.access_token}
                  onChange={(e) => setCloudForm({ ...cloudForm, access_token: e.target.value })}
                  placeholder="Permanent veya System User token"
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
                {cloudConnectMutation.isPending ? <Spinner /> : 'Cloud API ile Bağlan'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Webhook Ayarları (Meta)</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm text-gray-600">
              <p>Meta Developer Console → WhatsApp → Configuration → Webhook:</p>
              <div className="space-y-2">
                <Label>Callback URL</Label>
                <div className="flex gap-2">
                  <Input readOnly value={webhookUrl} className="text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={copyWebhook}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="font-medium">Verify Token</p>
                <p className="mt-1">Vercel&apos;deki <code className="text-xs">WHATSAPP_VERIFY_TOKEN</code> değerini Meta webhook doğrulamasına girin.</p>
              </div>
              <ol className="list-inside list-decimal space-y-1">
                <li>developers.facebook.com → uygulamanız</li>
                <li>WhatsApp → API Setup → Webhook</li>
                <li>URL ve Verify Token kaydedin</li>
                <li><strong>messages</strong> alanına abone olun</li>
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
                QR Kod ile Bağlan
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
                    {startQrMutation.isPending ? <span className="flex items-center gap-2"><Spinner /> QR oluşturuluyor...</span> : 'QR Kod Oluştur'}
                  </Button>
                </>
              ) : (
                <>
                  <img src={session.qr_data_url} alt="WhatsApp QR" className="h-56 w-56 rounded-2xl border-2 p-3" />
                  <StatusLabel status={session.status} />
                  <div className="flex w-full max-w-xs gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => startQrMutation.mutate()}>Yenile</Button>
                    <Button variant="ghost" className="flex-1" onClick={cancelQr}>İptal</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Nasıl Çalışır?</CardTitle></CardHeader>
            <CardContent className="text-sm text-gray-600">
              <p>Yerel geliştirmede QR ile bağlanın. Production (Vercel) ortamında Meta Cloud API kullanılır.</p>
            </CardContent>
          </Card>
        </div>
      )}

      {isConnected && (
        <Card>
          <CardHeader><CardTitle>Test Mesajı</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Alıcı Telefon</Label>
                <Input value={testPhone} onChange={(e) => { setTestPhone(e.target.value); setTestFeedback(null); }} placeholder="905551234567" />
              </div>
              <div className="space-y-2">
                <Label>Mesaj</Label>
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
              {testMutation.isPending ? 'Gönderiliyor...' : 'Test Gönder'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusLabel({ status }: { status: string }) {
  const labels: Record<string, { text: string; color: string }> = {
    pending: { text: 'QR kodu tarayın', color: 'text-gray-600' },
    scanned: { text: 'Bağlanıyor...', color: 'text-primary' },
    connected: { text: 'Bağlantı başarılı!', color: 'text-green-600' },
    expired: { text: 'QR süresi doldu', color: 'text-red-600' },
    failed: { text: 'Bağlantı başarısız', color: 'text-red-600' },
  };
  const info = labels[status] || labels.pending;
  return <p className={cn('font-medium', info.color)}>{info.text}</p>;
}
