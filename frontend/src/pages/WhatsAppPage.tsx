/**
 * WhatsApp multi-account management page
 * QR (Baileys) locally | Meta Cloud API on Vercel
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Smartphone, Wifi, WifiOff, QrCode, Send, Unplug, Cloud, Copy, Check,
  Plus, Trash2, RefreshCw, Building2, Star, Power,
} from 'lucide-react';
import { api } from '@/services/api';
import {
  Button, Input, Label, Card, CardContent, CardHeader, CardTitle, Spinner, Badge,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { getWhatsAppLineLimit } from '@/lib/plan-capabilities';

interface Department {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface QrSession {
  id: string;
  session_token: string;
  qr_data_url: string;
  status: 'pending' | 'scanned' | 'connected' | 'expired' | 'failed';
  phone_number: string | null;
  display_name: string | null;
  expires_at: string;
}

interface WhatsAppAccount {
  id: string;
  label: string | null;
  phone_number: string | null;
  profile_name: string | null;
  status: string;
  is_active: boolean;
  is_default: boolean;
  last_synced_at: string | null;
  connection_type: 'qr' | 'api' | null;
  departments: Department[];
  live_connected?: boolean;
  reconnecting?: boolean;
}

interface AccountsResponse {
  accounts: WhatsAppAccount[];
  limit: number;
  used: number;
  plan_type: string;
  supports_qr?: boolean;
  webhook_url?: string | null;
}

export function WhatsAppPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeQr, setActiveQr] = useState<{ accountId: string; session: QrSession } | null>(null);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [newDeptName, setNewDeptName] = useState('');
  const [testState, setTestState] = useState<Record<string, { phone: string; message: string; feedback?: { type: 'success' | 'error'; text: string } }>>({});
  const [cloudForms, setCloudForms] = useState<Record<string, { phone_number: string; business_account_id: string; access_token: string }>>({});
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-accounts'],
    queryFn: () => api.get<AccountsResponse>('/whatsapp/accounts'),
    refetchInterval: (query) => {
      const accounts = query.state.data?.accounts || [];
      const hasReconnecting = accounts.some((a) => a.reconnecting || a.status === 'reconnecting');
      if (activeQr) return false;
      if (hasReconnecting) return 8000;
      return 15000;
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<Department[]>('/departments'),
  });

  const accounts = data?.accounts || [];
  const limit = data?.limit ?? getWhatsAppLineLimit(data?.plan_type);
  const used = data?.used ?? accounts.length;
  const canAdd = used < limit;
  const useCloudApi = data?.supports_qr === false;
  const webhookUrl = data?.webhook_url || `${window.location.origin}/webhook/whatsapp`;
  const webhookSteps = t('whatsapp.webhookSteps', { returnObjects: true }) as string[];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['whatsapp-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
  };

  const createAccountMutation = useMutation({
    mutationFn: () => api.post<WhatsAppAccount>('/whatsapp/accounts', {}),
    onSuccess: (account) => {
      invalidate();
      setExpandedAccount(account.id);
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; is_active?: boolean; is_default?: boolean; department_ids?: string[]; label?: string }) =>
      api.patch(`/whatsapp/accounts/${id}`, body),
    onSuccess: invalidate,
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/whatsapp/accounts/${id}`),
    onSuccess: invalidate,
  });

  const startQrMutation = useMutation({
    mutationFn: (accountId: string) => api.post<QrSession>(`/whatsapp/accounts/${accountId}/qr/start`),
    onSuccess: (session, accountId) => {
      setActiveQr({ accountId, session });
      invalidate();
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (accountId: string) => api.post(`/whatsapp/accounts/${accountId}/disconnect`),
    onSuccess: () => {
      setActiveQr(null);
      invalidate();
    },
  });

  const cloudConnectMutation = useMutation({
    mutationFn: ({ accountId, form }: { accountId: string; form: { phone_number: string; business_account_id: string; access_token: string } }) =>
      api.put(`/whatsapp/accounts/${accountId}/config`, form),
    onSuccess: invalidate,
  });

  const createDeptMutation = useMutation({
    mutationFn: (name: string) => api.post<Department>('/departments', { name }),
    onSuccess: () => {
      setNewDeptName('');
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      invalidate();
    },
  });

  const deleteDeptMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/departments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      invalidate();
    },
  });

  const pollQrStatus = useCallback(async () => {
    if (!activeQr || ['connected', 'expired', 'failed'].includes(activeQr.session.status)) return;
    try {
      const updated = await api.get<QrSession>(
        `/whatsapp/accounts/${activeQr.accountId}/qr/${activeQr.session.session_token}/status`
      );
      setActiveQr({ accountId: activeQr.accountId, session: updated });
      if (updated.status === 'connected') invalidate();
    } catch {
      /* rate limit — skip */
    }
  }, [activeQr, queryClient]);

  useEffect(() => {
    if (!activeQr || ['connected', 'expired', 'failed'].includes(activeQr.session.status)) return;
    const interval = setInterval(pollQrStatus, 3500);
    pollQrStatus();
    return () => clearInterval(interval);
  }, [activeQr, pollQrStatus]);

  const cancelQr = async () => {
    if (!activeQr) return;
    await api.delete(`/whatsapp/accounts/${activeQr.accountId}/qr/${activeQr.session.session_token}`);
    setActiveQr(null);
  };

  const sendTest = async (accountId: string) => {
    const state = testState[accountId];
    if (!state?.phone) return;
    setTestState((s) => ({ ...s, [accountId]: { ...state, feedback: undefined } }));
    try {
      await api.post(`/whatsapp/accounts/${accountId}/test`, {
        to_phone: state.phone,
        message: state.message || t('whatsapp.defaultTestMsg'),
      });
      setTestState((s) => ({
        ...s,
        [accountId]: { ...state, feedback: { type: 'success', text: t('whatsapp.testSent') } },
      }));
    } catch (err) {
      setTestState((s) => ({
        ...s,
        [accountId]: { ...state, feedback: { type: 'error', text: (err as Error).message } },
      }));
    }
  };

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const connectedCount = accounts.filter((a) => a.status === 'connected').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('whatsapp.title')}</h1>
          <p className="text-gray-500">{t('whatsapp.multiDesc')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <Badge variant="default" className="px-3 py-1.5 text-sm">
            {t('whatsapp.lineUsage', { used, limit: limit >= 999 ? '∞' : limit })}
          </Badge>
          {connectedCount > 0 && (
            <Badge variant="success" className="px-3 py-1.5 text-sm">
              <Wifi className="mr-1 h-4 w-4" /> {connectedCount} {t('whatsapp.connected')}
            </Badge>
          )}
        </div>
      </div>

      {/* Add account */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">{t('whatsapp.planLimitHint', { limit: limit >= 999 ? t('whatsapp.unlimited') : limit })}</p>
        <Button
          className="w-full sm:w-auto"
          onClick={() => createAccountMutation.mutate()}
          disabled={!canAdd || createAccountMutation.isPending}
        >
          {createAccountMutation.isPending ? <Spinner /> : <Plus className="h-4 w-4" />}
          {t('whatsapp.addAccount')}
        </Button>
      </div>

      {createAccountMutation.isError && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {(createAccountMutation.error as Error).message}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            <Smartphone className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p>{t('whatsapp.noAccounts')}</p>
            <Button className="mt-4" onClick={() => createAccountMutation.mutate()} disabled={createAccountMutation.isPending}>
              <Plus className="h-4 w-4" /> {t('whatsapp.addFirstAccount')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              departments={departments}
              isExpanded={expandedAccount === account.id}
              onToggle={() => setExpandedAccount(expandedAccount === account.id ? null : account.id)}
              useCloudApi={useCloudApi}
              activeQr={activeQr?.accountId === account.id ? activeQr.session : null}
              cloudForm={cloudForms[account.id]}
              testState={testState[account.id]}
              onCloudFormChange={(form) => setCloudForms((f) => ({ ...f, [account.id]: form }))}
              onTestChange={(state) => setTestState((s) => ({ ...s, [account.id]: state }))}
              onStartQr={() => startQrMutation.mutate(account.id)}
              onDisconnect={() => disconnectMutation.mutate(account.id)}
              onDelete={() => {
                if (window.confirm(t('whatsapp.deleteConfirm'))) deleteAccountMutation.mutate(account.id);
              }}
              onToggleActive={(active) => updateAccountMutation.mutate({ id: account.id, is_active: active })}
              onSetDefault={() => updateAccountMutation.mutate({ id: account.id, is_default: true })}
              onDepartmentsChange={(ids) => updateAccountMutation.mutate({ id: account.id, department_ids: ids })}
              onCloudConnect={(form) => cloudConnectMutation.mutate({ accountId: account.id, form })}
              onCancelQr={cancelQr}
              onRefreshQr={() => startQrMutation.mutate(account.id)}
              isQrPending={startQrMutation.isPending && startQrMutation.variables === account.id}
              isDisconnecting={disconnectMutation.isPending && disconnectMutation.variables === account.id}
              onSendTest={() => sendTest(account.id)}
            />
          ))}
        </div>
      )}

      {/* Departments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            {t('whatsapp.departments')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">{t('whatsapp.departmentsDesc')}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              placeholder={t('whatsapp.deptNamePlaceholder')}
              className="flex-1"
            />
            <Button
              className="w-full sm:w-auto"
              onClick={() => createDeptMutation.mutate(newDeptName)}
              disabled={!newDeptName.trim() || createDeptMutation.isPending}
            >
              <Plus className="h-4 w-4" /> {t('whatsapp.addDepartment')}
            </Button>
          </div>
          {departments.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {departments.map((dept) => (
                <Badge key={dept.id} variant="default" className="gap-1 px-3 py-1.5">
                  {dept.name}
                  <button
                    type="button"
                    className="ml-1 text-gray-400 hover:text-red-500"
                    onClick={() => {
                      if (window.confirm(t('whatsapp.deleteDeptConfirm'))) deleteDeptMutation.mutate(dept.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">{t('whatsapp.noDepartments')}</p>
          )}
        </CardContent>
      </Card>

      {/* Webhook info for Cloud API */}
      {useCloudApi && (
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
            <ol className="list-inside list-decimal space-y-1">
              {webhookSteps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface AccountCardProps {
  account: WhatsAppAccount;
  departments: Department[];
  isExpanded: boolean;
  onToggle: () => void;
  useCloudApi: boolean;
  activeQr: QrSession | null;
  cloudForm?: { phone_number: string; business_account_id: string; access_token: string };
  testState?: { phone: string; message: string; feedback?: { type: 'success' | 'error'; text: string } };
  onCloudFormChange: (form: { phone_number: string; business_account_id: string; access_token: string }) => void;
  onTestChange: (state: { phone: string; message: string }) => void;
  onStartQr: () => void;
  onDisconnect: () => void;
  onDelete: () => void;
  onToggleActive: (active: boolean) => void;
  onSetDefault: () => void;
  onDepartmentsChange: (ids: string[]) => void;
  onCloudConnect: (form: { phone_number: string; business_account_id: string; access_token: string }) => void;
  onCancelQr: () => void;
  onRefreshQr: () => void;
  isQrPending: boolean;
  isDisconnecting: boolean;
  onSendTest: () => void;
}

function AccountCard({
  account, departments, isExpanded, onToggle, useCloudApi, activeQr,
  cloudForm, testState, onCloudFormChange, onTestChange,
  onStartQr, onDisconnect, onDelete, onToggleActive, onSetDefault,
  onDepartmentsChange, onCloudConnect, onCancelQr, onRefreshQr,
  isQrPending, isDisconnecting, onSendTest,
}: AccountCardProps) {
  const { t } = useTranslation();
  const isConnected = account.status === 'connected';
  const isReconnecting = account.status === 'reconnecting' || account.reconnecting;
  const selectedDeptIds = account.departments.map((d) => d.id);

  const statusBadge = isConnected ? (
    <Badge variant="success"><Wifi className="mr-1 h-3 w-3" /> {t('whatsapp.connected')}</Badge>
  ) : isReconnecting ? (
    <Badge variant="warning"><Wifi className="mr-1 h-3 w-3 animate-pulse" /> {t('whatsapp.reconnecting')}</Badge>
  ) : !account.is_active ? (
    <Badge variant="default"><Power className="mr-1 h-3 w-3" /> {t('whatsapp.inactive')}</Badge>
  ) : (
    <Badge variant="danger"><WifiOff className="mr-1 h-3 w-3" /> {t('whatsapp.disconnected')}</Badge>
  );

  return (
    <Card className={cn(!account.is_active && 'opacity-75')}>
      <button
        type="button"
        className="w-full text-left"
        onClick={onToggle}
      >
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold truncate">{account.label || t('whatsapp.unnamed')}</p>
                {account.is_default && (
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500 shrink-0" />
                )}
              </div>
              <p className="text-sm text-gray-500 truncate">
                {account.phone_number || account.profile_name || t('whatsapp.notConnected')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            {statusBadge}
          </div>
        </CardContent>
      </button>

      {isExpanded && (
        <CardContent className="border-t pt-4 space-y-4">
          {/* Meta info */}
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <InfoRow label={t('whatsapp.profileName')} value={account.profile_name || '—'} />
            <InfoRow label={t('whatsapp.phoneNumber')} value={account.phone_number || '—'} />
            <InfoRow
              label={t('whatsapp.lastSync')}
              value={account.last_synced_at ? new Date(account.last_synced_at).toLocaleString() : '—'}
            />
            <InfoRow
              label={t('whatsapp.linkedDepartments')}
              value={
                account.departments.length
                  ? account.departments.map((d) => d.name).join(', ')
                  : t('whatsapp.noLinkedDepartments')
              }
            />
          </div>

          {/* Active toggle + default */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              variant={account.is_active ? 'outline' : 'default'}
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => onToggleActive(!account.is_active)}
            >
              <Power className="h-4 w-4" />
              {account.is_active ? t('whatsapp.setInactive') : t('whatsapp.setActive')}
            </Button>
            {!account.is_default && (
              <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={onSetDefault}>
                <Star className="h-4 w-4" /> {t('whatsapp.setDefault')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-red-600 hover:text-red-700 sm:ml-auto sm:w-auto"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" /> {t('whatsapp.deleteAccount')}
            </Button>
          </div>

          {/* Department linking */}
          {departments.length > 0 && (
            <div className="space-y-2">
              <Label>{t('whatsapp.linkDepartments')}</Label>
              <p className="text-xs text-gray-500">{t('whatsapp.linkDepartmentsHint')}</p>
              <div className="flex flex-wrap gap-2">
                {departments.map((dept) => {
                  const selected = selectedDeptIds.includes(dept.id);
                  return (
                    <button
                      key={dept.id}
                      type="button"
                      className={cn(
                        'rounded-full border px-3 py-1 text-sm transition-colors',
                        selected ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      )}
                      onClick={() => {
                        const next = selected
                          ? selectedDeptIds.filter((id) => id !== dept.id)
                          : [...selectedDeptIds, dept.id];
                        onDepartmentsChange(next);
                      }}
                    >
                      {dept.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Connection */}
          {useCloudApi ? (
            <CloudApiForm
              account={account}
              form={cloudForm || { phone_number: account.phone_number || '', business_account_id: '', access_token: '' }}
              onChange={onCloudFormChange}
              onConnect={onCloudConnect}
              onDisconnect={onDisconnect}
              isDisconnecting={isDisconnecting}
            />
          ) : isConnected ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="w-full sm:w-auto" onClick={onDisconnect} disabled={isDisconnecting}>
                <Unplug className="h-4 w-4" /> {t('whatsapp.disconnect')}
              </Button>
              <Button variant="outline" className="w-full sm:w-auto" onClick={onStartQr}>
                <RefreshCw className="h-4 w-4" /> {t('whatsapp.reconnectWithQr')}
              </Button>
            </div>
          ) : (
            <QrPanel
              activeQr={activeQr}
              isReconnecting={!!isReconnecting}
              isPending={isQrPending}
              onStart={onStartQr}
              onRefresh={onRefreshQr}
              onCancel={onCancelQr}
            />
          )}

          {/* Test message */}
          {isConnected && (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">{t('whatsapp.testMessage')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={testState?.phone || ''}
                  onChange={(e) => onTestChange({ phone: e.target.value, message: testState?.message || '' })}
                  placeholder="905551234567"
                />
                <Input
                  value={testState?.message || t('whatsapp.defaultTestMsg')}
                  onChange={(e) => onTestChange({ phone: testState?.phone || '', message: e.target.value })}
                />
              </div>
              {testState?.feedback && (
                <div className={cn('rounded-lg p-2 text-sm', testState.feedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>
                  {testState.feedback.text}
                </div>
              )}
              <Button size="sm" className="w-full sm:w-auto" onClick={onSendTest} disabled={!testState?.phone}>
                <Send className="h-4 w-4" /> {t('whatsapp.sendTest')}
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function QrPanel({
  activeQr, isReconnecting, isPending, onStart, onRefresh, onCancel,
}: {
  activeQr: QrSession | null;
  isReconnecting: boolean;
  isPending: boolean;
  onStart: () => void;
  onRefresh: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  if (isReconnecting && !activeQr) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
        <p className="text-sm font-medium text-amber-800">{t('whatsapp.reconnectingTitle')}</p>
        <p className="text-sm text-amber-700">{t('whatsapp.reconnectingDesc')}</p>
        <Button className="w-full sm:w-auto" onClick={onStart} disabled={isPending}>
          {isPending ? <Spinner /> : <QrCode className="h-4 w-4" />}
          {t('whatsapp.reconnectWithQr')}
        </Button>
      </div>
    );
  }

  if (!activeQr) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed p-6">
        <QrCode className="h-12 w-12 text-gray-300" />
        <Button className="w-full max-w-xs" onClick={onStart} disabled={isPending}>
          {isPending ? <span className="flex items-center gap-2"><Spinner /> {t('whatsapp.generatingQr')}</span> : t('whatsapp.generateQr')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <img src={activeQr.qr_data_url} alt="WhatsApp QR" className="h-52 w-52 rounded-2xl border-2 p-3 sm:h-56 sm:w-56" />
      <StatusLabel status={activeQr.status} />
      <div className="flex w-full max-w-xs gap-2">
        <Button variant="outline" className="flex-1" onClick={onRefresh}>{t('whatsapp.refresh')}</Button>
        <Button variant="ghost" className="flex-1" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </div>
  );
}

function CloudApiForm({
  account, form, onChange, onConnect, onDisconnect, isDisconnecting,
}: {
  account: WhatsAppAccount;
  form: { phone_number: string; business_account_id: string; access_token: string };
  onChange: (f: { phone_number: string; business_account_id: string; access_token: string }) => void;
  onConnect: (f: { phone_number: string; business_account_id: string; access_token: string }) => void;
  onDisconnect: () => void;
  isDisconnecting: boolean;
}) {
  const { t } = useTranslation();
  const isConnected = account.status === 'connected';

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Cloud className="h-4 w-4" /> {t('whatsapp.cloudApi')}
      </p>
      <div className="space-y-2">
        <Label>{t('whatsapp.businessPhone')}</Label>
        <Input value={form.phone_number} onChange={(e) => onChange({ ...form, phone_number: e.target.value })} placeholder={t('whatsapp.phonePlaceholder')} />
      </div>
      <div className="space-y-2">
        <Label>{t('whatsapp.phoneNumberId')}</Label>
        <Input value={form.business_account_id} onChange={(e) => onChange({ ...form, business_account_id: e.target.value })} placeholder={t('whatsapp.phoneNumberIdPlaceholder')} />
      </div>
      <div className="space-y-2">
        <Label>{t('whatsapp.accessToken')}</Label>
        <Input type="password" value={form.access_token} onChange={(e) => onChange({ ...form, access_token: e.target.value })} placeholder={t('whatsapp.accessTokenPlaceholder')} />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="w-full sm:w-auto" onClick={() => onConnect(form)} disabled={!form.access_token}>
          {t('whatsapp.connectCloud')}
        </Button>
        {isConnected && (
          <Button variant="outline" className="w-full sm:w-auto" onClick={onDisconnect} disabled={isDisconnecting}>
            <Unplug className="h-4 w-4" /> {t('whatsapp.disconnect')}
          </Button>
        )}
      </div>
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
  return <p className={cn('font-medium', colorMap[status] || colorMap.pending)}>{t(keys[status] || keys.pending)}</p>;
}
