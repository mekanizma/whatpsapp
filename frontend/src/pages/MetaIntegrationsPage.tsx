/**
 * Meta entegrasyonu — tek tık OAuth
 * Firma kendi Facebook hesabıyla giriş yapar; Messenger + Instagram otomatik bağlanır.
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Facebook, Instagram, Plug, Power, Send, Unplug, Trash2, Wifi, WifiOff, RefreshCw,
} from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Input, Label, Spinner,
} from '@/components/ui';
import { cn } from '@/lib/utils';

type MetaChannel = 'facebook_messenger' | 'instagram_dm';

interface MetaConnection {
  id: string;
  channel: MetaChannel;
  status: string;
  label: string | null;
  page_name: string | null;
  account_name: string | null;
  external_page_id: string | null;
  external_ig_user_id: string | null;
  inbound_enabled: boolean;
  is_active: boolean;
  has_token: boolean;
  last_error: string | null;
  connected_at: string | null;
}

interface MetaConnectionsResponse {
  connections: MetaConnection[];
  oauth_configured: boolean;
  meta_app_id: string | null;
  connected_messenger: boolean;
  connected_instagram: boolean;
}

export function MetaIntegrationsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [testState, setTestState] = useState<Record<string, { recipient: string; message: string }>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['meta-connections'],
    queryFn: () => api.get<MetaConnectionsResponse>('/meta/connections'),
  });

  const connections = useMemo(
    () => (data?.connections || []).filter((c) => c.status === 'connected' || c.status === 'disconnected' || c.status === 'error'),
    [data?.connections]
  );
  const messengerConnections = connections.filter((c) => c.channel === 'facebook_messenger');
  const instagramConnections = connections.filter((c) => c.channel === 'instagram_dm');

  useEffect(() => {
    const oauth = searchParams.get('oauth');
    if (!oauth) return;

    if (oauth === 'success') {
      const messenger = Number(searchParams.get('messenger') || 0);
      const instagram = Number(searchParams.get('instagram') || 0);
      setBanner({
        type: 'ok',
        text: t('meta.oauthAutoSuccess', { messenger, instagram }),
      });
    } else {
      setBanner({
        type: 'err',
        text: t('meta.oauthError', {
          reason: searchParams.get('reason') || 'unknown',
        }),
      });
    }
    setSearchParams({}, { replace: true });
    queryClient.invalidateQueries({ queryKey: ['meta-connections'] });
  }, [searchParams, setSearchParams, queryClient, t]);

  const startOAuth = useMutation({
    mutationFn: () => api.post<{ url: string }>('/meta/oauth/start', { mode: 'all' }),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (err: Error) => setBanner({ type: 'err', text: err.message }),
  });

  const patchConnection = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      inbound_enabled?: boolean;
      is_active?: boolean;
    }) => api.patch(`/meta/connections/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meta-connections'] }),
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => api.post(`/meta/connections/${id}/disconnect`),
    onSuccess: () => {
      setBanner({ type: 'ok', text: t('meta.disconnected') });
      queryClient.invalidateQueries({ queryKey: ['meta-connections'] });
    },
  });

  const removeConnection = useMutation({
    mutationFn: (id: string) => api.delete(`/meta/connections/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meta-connections'] }),
  });

  const sendTest = useMutation({
    mutationFn: ({
      id,
      recipient_id,
      message,
    }: {
      id: string;
      recipient_id: string;
      message: string;
    }) => api.post(`/meta/connections/${id}/test`, { recipient_id, message }),
    onSuccess: () => setBanner({ type: 'ok', text: t('meta.testSent') }),
    onError: (err: Error) => setBanner({ type: 'err', text: err.message }),
  });

  const anyConnected = data?.connected_messenger || data?.connected_instagram;

  function renderConnectionCard(conn: MetaConnection) {
    const connected = conn.status === 'connected' && conn.is_active;
    const test = testState[conn.id] || {
      recipient: '',
      message: t('meta.defaultTestMessage'),
    };
    const isIg = conn.channel === 'instagram_dm';

    return (
      <div
        key={conn.id}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {isIg ? (
                <Instagram className="h-4 w-4 text-pink-500" />
              ) : (
                <Facebook className="h-4 w-4 text-blue-600" />
              )}
              <p className="truncate font-semibold text-slate-900">
                {conn.label || conn.page_name || conn.account_name || t('meta.unnamed')}
              </p>
              <Badge variant={connected ? 'success' : 'default'}>
                {connected ? (
                  <><Wifi className="mr-1 h-3 w-3" />{t('meta.connected')}</>
                ) : (
                  <><WifiOff className="mr-1 h-3 w-3" />{t('meta.disconnected')}</>
                )}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              {isIg ? t('meta.instagram') : t('meta.messenger')}
              {conn.page_name ? ` · ${conn.page_name}` : ''}
            </p>
            {conn.last_error && (
              <p className="text-xs text-red-600">{conn.last_error}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="min-h-10"
              onClick={() =>
                patchConnection.mutate({
                  id: conn.id,
                  inbound_enabled: !conn.inbound_enabled,
                })
              }
            >
              <Power className="mr-1 h-3.5 w-3.5" />
              {conn.inbound_enabled ? t('meta.inboundOn') : t('meta.inboundOff')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-10"
              onClick={() => disconnect.mutate(conn.id)}
            >
              <Unplug className="mr-1 h-3.5 w-3.5" />
              {t('meta.disconnect')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-10 text-red-600"
              onClick={() => {
                if (window.confirm(t('meta.deleteConfirm'))) {
                  removeConnection.mutate(conn.id);
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {connected && (
          <div className="space-y-3 rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('meta.testSection')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`recipient-${conn.id}`}>{t('meta.recipientId')}</Label>
                <Input
                  id={`recipient-${conn.id}`}
                  className="min-h-11"
                  placeholder={isIg ? 'IGSID' : 'PSID'}
                  value={test.recipient}
                  onChange={(e) =>
                    setTestState((s) => ({
                      ...s,
                      [conn.id]: { ...test, recipient: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`msg-${conn.id}`}>{t('meta.testMessage')}</Label>
                <Input
                  id={`msg-${conn.id}`}
                  className="min-h-11"
                  value={test.message}
                  onChange={(e) =>
                    setTestState((s) => ({
                      ...s,
                      [conn.id]: { ...test, message: e.target.value },
                    }))
                  }
                />
              </div>
            </div>
            <Button
              className="w-full min-h-11 sm:w-auto"
              disabled={!test.recipient.trim() || sendTest.isPending}
              onClick={() =>
                sendTest.mutate({
                  id: conn.id,
                  recipient_id: test.recipient.trim(),
                  message: test.message.trim() || t('meta.defaultTestMessage'),
                })
              }
            >
              <Send className="mr-2 h-4 w-4" />
              {t('meta.sendTest')}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-1 sm:px-0">
      <PageHeader title={t('meta.title')} description={t('meta.descriptionSimple')} />

      {banner && (
        <div
          className={cn(
            'rounded-xl px-4 py-3 text-sm',
            banner.type === 'ok'
              ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
              : 'bg-red-50 text-red-800 ring-1 ring-red-200'
          )}
        >
          {banner.text}
        </div>
      )}

      {!data?.oauth_configured && !isLoading && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="pt-5 text-sm text-amber-900">
            {t('meta.oauthNotConfigured')}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="text-base">{t('meta.connectTitle')}</CardTitle>
          <CardDescription>{t('meta.connectDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div
              className={cn(
                'flex min-h-11 flex-1 items-center gap-2 rounded-xl px-3 text-sm ring-1 sm:flex-none',
                data?.connected_messenger
                  ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                  : 'bg-slate-50 text-slate-600 ring-slate-200'
              )}
            >
              <Facebook className="h-4 w-4" />
              {data?.connected_messenger ? t('meta.statusMessengerOn') : t('meta.statusMessengerOff')}
            </div>
            <div
              className={cn(
                'flex min-h-11 flex-1 items-center gap-2 rounded-xl px-3 text-sm ring-1 sm:flex-none',
                data?.connected_instagram
                  ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                  : 'bg-slate-50 text-slate-600 ring-slate-200'
              )}
            >
              <Instagram className="h-4 w-4" />
              {data?.connected_instagram ? t('meta.statusInstagramOn') : t('meta.statusInstagramOff')}
            </div>
          </div>

          <Button
            className="w-full min-h-12 text-base"
            onClick={() => startOAuth.mutate()}
            disabled={!data?.oauth_configured || startOAuth.isPending}
          >
            {startOAuth.isPending ? (
              <Spinner className="h-4 w-4" />
            ) : anyConnected ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Plug className="h-4 w-4" />
            )}
            <span className="ml-2">
              {anyConnected ? t('meta.reconnectOAuth') : t('meta.connectOAuth')}
            </span>
          </Button>
          <p className="text-center text-xs text-slate-500">{t('meta.connectHint')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('meta.accountsTitle')}</CardTitle>
          <CardDescription>{t('meta.accountsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : connections.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">{t('meta.noConnectionsSimple')}</p>
          ) : (
            <>
              {messengerConnections.map(renderConnectionCard)}
              {instagramConnections.map(renderConnectionCard)}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
