/**
 * WhatsApp bağlantı sayfası - QR ile hat bağlama
 */

import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Smartphone, Wifi, WifiOff, RefreshCw, QrCode, Send, Unplug } from 'lucide-react';
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
}

export function WhatsAppPage() {
  const [session, setSession] = useState<QrSession | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Merhaba! Test mesajı.');
  const [testFeedback, setTestFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const queryClient = useQueryClient();

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: () => api.get<WaStatus>('/whatsapp/status'),
    refetchInterval: 5000,
  });

  const isConnected = status?.is_configured || status?.status === 'connected';

  const startQrMutation = useMutation({
    mutationFn: () => api.post<QrSession>('/whatsapp/qr/start'),
    onSuccess: (data) => setSession(data),
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
      /* ignore poll errors */
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">WhatsApp Bağlantısı</h1>
          <p className="text-gray-500">QR kod ile iş hattınızı bağlayın</p>
        </div>
        {isConnected ? (
          <Badge variant="success" className="self-start px-3 py-1.5 text-sm">
            <Wifi className="h-4 w-4 mr-1" /> Bağlı
          </Badge>
        ) : (
          <Badge variant="danger" className="self-start px-3 py-1.5 text-sm">
            <WifiOff className="h-4 w-4 mr-1" /> Bağlı Değil
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
                  <p className="font-semibold text-lg">{status?.phone_number}</p>
                  <p className="text-sm text-gray-500">
                    {status?.connection_type === 'qr' ? 'QR ile bağlandı' : 'API ile bağlandı'}
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
                  <p className="text-center text-sm text-gray-500 max-w-xs">
                    Telefonunuzdan WhatsApp veya WhatsApp Business ile gerçek QR kodu tarayın
                  </p>
                  {startQrMutation.isError && (
                    <div className="w-full max-w-xs rounded-lg bg-red-50 p-3 text-sm text-red-600">
                      {(startQrMutation.error as Error).message}
                    </div>
                  )}
                  <Button onClick={() => startQrMutation.mutate()} disabled={startQrMutation.isPending} className="w-full max-w-xs">
                    {startQrMutation.isPending ? (
                      <span className="flex items-center gap-2"><Spinner /> QR oluşturuluyor...</span>
                    ) : 'QR Kod Oluştur'}
                  </Button>
                  {startQrMutation.isPending && (
                    <p className="text-xs text-gray-400">Bu işlem 10-20 saniye sürebilir</p>
                  )}
                </>
              ) : (
                <>
                  <div className={cn(
                    'relative rounded-2xl border-2 p-3 transition-all',
                    session.status === 'scanned' ? 'border-primary bg-primary/5' : 'border-gray-200'
                  )}>
                    <img src={session.qr_data_url} alt="WhatsApp QR" className="h-56 w-56" />
                    {session.status === 'scanned' && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-primary/10">
                        <div className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white">
                          Taranıyor...
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="text-center space-y-1">
                    <StatusLabel status={session.status} />
                    <p className="text-xs text-gray-400">
                      {new Date(session.expires_at).toLocaleTimeString('tr-TR')} tarihine kadar geçerli
                    </p>
                  </div>

                  <div className="flex gap-2 w-full max-w-xs">
                    <Button variant="outline" className="flex-1" onClick={() => startQrMutation.mutate()} disabled={startQrMutation.isPending}>
                      <RefreshCw className="h-4 w-4" />
                      Yenile
                    </Button>
                    <Button variant="ghost" className="flex-1" onClick={cancelQr}>
                      İptal
                    </Button>
                  </div>

                  <ol className="w-full max-w-sm space-y-2 text-sm text-gray-600 list-decimal list-inside">
                    <li>Telefonunuzda <strong>WhatsApp</strong> veya <strong>WhatsApp Business</strong> uygulamasını açın</li>
                    <li><strong>Ayarlar</strong> (⚙️) → <strong>Bağlı Cihazlar</strong> → <strong>Cihaz Bağla</strong></li>
                    <li><strong>QR kod ile giriş yap</strong> seçeneğine dokunun</li>
                    <li>Ekrandaki QR kodu telefonunuzla tarayın</li>
                  </ol>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Nasıl Çalışır?</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm text-gray-600">
              <div className="rounded-lg bg-primary/5 p-4 border border-primary/20">
                <p className="font-medium text-gray-900 mb-2">Güvenli Bağlantı</p>
                <p>QR kod yalnızca 2 dakika geçerlidir. Bağlantı sonrası mesajlar otomatik olarak panele düşer.</p>
              </div>
              <div className="space-y-2">
                <p className="font-medium text-gray-900">Gereksinimler:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>WhatsApp Business hesabı</li>
                  <li>Onaylı iş telefon numarası</li>
                  <li>İnternet bağlantısı olan telefon</li>
                </ul>
              </div>
              <Button variant="outline" className="w-full" onClick={() => refetchStatus()}>
                <RefreshCw className="h-4 w-4" />
                Durumu Kontrol Et
              </Button>
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
                <Input
                  value={testPhone}
                  onChange={(e) => { setTestPhone(e.target.value); setTestFeedback(null); }}
                  placeholder="905551234567"
                />
                <p className="text-xs text-gray-400">Ülke kodu ile, başında + olmadan</p>
              </div>
              <div className="space-y-2">
                <Label>Mesaj</Label>
                <Input value={testMessage} onChange={(e) => setTestMessage(e.target.value)} />
              </div>
            </div>
            {testFeedback && (
              <div className={cn(
                'rounded-lg p-3 text-sm',
                testFeedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
              )}>
                {testFeedback.text}
              </div>
            )}
            <Button
              onClick={() => { setTestFeedback(null); testMutation.mutate(); }}
              disabled={!testPhone || testMutation.isPending}
            >
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
    scanned: { text: 'Telefon tarandı, bağlanıyor...', color: 'text-primary' },
    connected: { text: 'Bağlantı başarılı!', color: 'text-green-600' },
    expired: { text: 'QR süresi doldu, yenileyin', color: 'text-red-600' },
    failed: { text: 'Bağlantı başarısız', color: 'text-red-600' },
  };
  const info = labels[status] || labels.pending;
  return <p className={cn('font-medium', info.color)}>{info.text}</p>;
}
