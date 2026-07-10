/**
 * WhatsApp multi-account management page
 * QR (Baileys) locally | Meta Cloud API on Vercel
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Smartphone, Wifi, WifiOff, QrCode, Send, Unplug, Cloud, Copy, Check,
  Plus, Trash2, RefreshCw, Building2, Star, Power, ChevronDown, Link2, Save,
} from 'lucide-react';
import { api } from '@/services/api';
import {
  Button, Input, Label, Card, CardContent, CardHeader, CardTitle, CardDescription, Spinner, Badge,
} from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
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
  business_account_id?: string | null;
  status: string;
  is_active: boolean;
  is_default: boolean;
  last_synced_at: string | null;
  updated_at?: string | null;
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
  supports_cloud_api?: boolean;
  webhook_url?: string | null;
  webhook_verify_token?: string | null;
}

interface CloudApiFormState {
  phone_number: string;
  business_account_id: string;
  access_token: string;
  app_secret: string;
}

export function WhatsAppPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeQr, setActiveQr] = useState<{ accountId: string; session: QrSession } | null>(null);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [newDeptName, setNewDeptName] = useState('');
  const [testState, setTestState] = useState<Record<string, { phone: string; message: string; feedback?: { type: 'success' | 'error'; text: string } }>>({});
  const [cloudForms, setCloudForms] = useState<Record<string, CloudApiFormState>>({});
  const [connectionModes, setConnectionModes] = useState<Record<string, 'qr' | 'api'>>({});
  const [cloudFeedback, setCloudFeedback] = useState<Record<string, { type: 'success' | 'error'; text: string }>>({});
  const [copied, setCopied] = useState<'url' | 'token' | null>(null);

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
  const supportsQr = data?.supports_qr !== false;
  const supportsCloudApi = data?.supports_cloud_api !== false;
  const webhookUrl = data?.webhook_url || `${window.location.origin}/webhook/whatsapp`;
  const webhookVerifyToken = data?.webhook_verify_token || '';
  const webhookSteps = t('whatsapp.webhookSteps', { returnObjects: true }) as string[];

  const getConnectionMode = (account: WhatsAppAccount): 'qr' | 'api' => {
    if (connectionModes[account.id]) return connectionModes[account.id];
    if (account.connection_type === 'api') return 'api';
    if (account.connection_type === 'qr') return 'qr';
    return supportsQr ? 'qr' : 'api';
  };

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
    mutationFn: ({ accountId, form }: { accountId: string; form: CloudApiFormState }) =>
      api.put(`/whatsapp/accounts/${accountId}/config`, form),
    onSuccess: (_data, { accountId }) => {
      setCloudFeedback((f) => ({
        ...f,
        [accountId]: { type: 'success', text: t('whatsapp.cloudConnectSuccess') },
      }));
      invalidate();
    },
    onError: (err, { accountId }) => {
      setCloudFeedback((f) => ({
        ...f,
        [accountId]: { type: 'error', text: (err as Error).message },
      }));
    },
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

  const copyToClipboard = async (text: string, kind: 'url' | 'token') => {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  };

  const connectedCount = accounts.filter((a) => a.status === 'connected').length;
  const limitLabel = limit >= 999 ? t('whatsapp.unlimited') : String(limit);

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('whatsapp.title')}
        description={t('whatsapp.multiDesc')}
        action={
          <Button
            className="w-full sm:w-auto"
            onClick={() => createAccountMutation.mutate()}
            disabled={!canAdd || createAccountMutation.isPending}
          >
            {createAccountMutation.isPending ? <Spinner /> : <Plus className="h-4 w-4" />}
            {t('whatsapp.addAccount')}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={Smartphone}
          label={t('whatsapp.statLines')}
          value={`${used} / ${limitLabel}`}
          hint={t('whatsapp.planLimitHint', { limit: limitLabel })}
        />
        <StatCard
          icon={Wifi}
          label={t('whatsapp.statConnected')}
          value={String(connectedCount)}
          hint={connectedCount > 0 ? t('whatsapp.connected') : t('whatsapp.disconnected')}
          accent={connectedCount > 0 ? 'success' : 'default'}
        />
        <StatCard
          icon={Building2}
          label={t('whatsapp.statDepartments')}
          value={String(departments.length)}
          hint={departments.length > 0 ? t('whatsapp.departmentsDesc') : t('whatsapp.noDepartments')}
        />
      </div>

      {createAccountMutation.isError && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
          {(createAccountMutation.error as Error).message}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t('whatsapp.sectionAccounts')}</h2>
            <p className="text-sm text-slate-500">{t('whatsapp.sectionAccountsDesc')}</p>
          </div>
          {!canAdd && (
            <Badge variant="warning" className="self-start px-3 py-1.5 text-sm">
              {t('whatsapp.lineUsage', { used, limit: limitLabel })}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : accounts.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <EmptyState
                icon={Smartphone}
                title={t('whatsapp.noAccounts')}
                description={t('whatsapp.planLimitHint', { limit: limitLabel })}
              />
              <div className="mt-4 flex justify-center">
                <Button onClick={() => createAccountMutation.mutate()} disabled={createAccountMutation.isPending}>
                  <Plus className="h-4 w-4" /> {t('whatsapp.addFirstAccount')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                departments={departments}
                isExpanded={expandedAccount === account.id}
                onToggle={() => setExpandedAccount(expandedAccount === account.id ? null : account.id)}
                connectionMode={getConnectionMode(account)}
                supportsQr={supportsQr}
                supportsCloudApi={supportsCloudApi}
                onConnectionModeChange={(mode) => {
                  setConnectionModes((m) => ({ ...m, [account.id]: mode }));
                  setCloudFeedback((f) => {
                    const next = { ...f };
                    delete next[account.id];
                    return next;
                  });
                }}
                activeQr={activeQr?.accountId === account.id ? activeQr.session : null}
                cloudForm={cloudForms[account.id]}
                cloudFeedback={cloudFeedback[account.id]}
                testState={testState[account.id]}
                onCloudFormChange={(form) => setCloudForms((f) => ({ ...f, [account.id]: form }))}
                onTestChange={(state) => setTestState((s) => ({ ...s, [account.id]: state }))}
                onStartQr={() => startQrMutation.mutate(account.id)}
                onDisconnect={() => disconnectMutation.mutate(account.id)}
                onDelete={() => {
                  if (window.confirm(t('whatsapp.deleteConfirm'))) deleteAccountMutation.mutate(account.id);
                }}
                onToggleActive={(active) => updateAccountMutation.mutate({ id: account.id, is_active: active })}
                onSaveLabel={(label) => updateAccountMutation.mutate({ id: account.id, label })}
                onSetDefault={() => updateAccountMutation.mutate({ id: account.id, is_default: true })}
                onDepartmentsChange={(ids) => updateAccountMutation.mutate({ id: account.id, department_ids: ids })}
                onCloudConnect={(form) => cloudConnectMutation.mutate({ accountId: account.id, form })}
                onCancelQr={cancelQr}
                onRefreshQr={() => startQrMutation.mutate(account.id)}
                isQrPending={startQrMutation.isPending && startQrMutation.variables === account.id}
                isCloudPending={cloudConnectMutation.isPending && cloudConnectMutation.variables?.accountId === account.id}
                isDisconnecting={disconnectMutation.isPending && disconnectMutation.variables === account.id}
                isSavingLabel={updateAccountMutation.isPending && updateAccountMutation.variables?.id === account.id && updateAccountMutation.variables?.label !== undefined}
                onSendTest={() => sendTest(account.id)}
              />
            ))}
          </div>
        )}
      </section>

      <div className={cn('grid gap-6', supportsCloudApi ? 'lg:grid-cols-2' : 'lg:grid-cols-1')}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-primary" />
              {t('whatsapp.departments')}
            </CardTitle>
            <CardDescription>{t('whatsapp.departmentsDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder={t('whatsapp.deptNamePlaceholder')}
                className="h-11 flex-1"
              />
              <Button
                className="h-11 w-full sm:w-auto"
                onClick={() => createDeptMutation.mutate(newDeptName)}
                disabled={!newDeptName.trim() || createDeptMutation.isPending}
              >
                <Plus className="h-4 w-4" /> {t('whatsapp.addDepartment')}
              </Button>
            </div>
            {departments.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {departments.map((dept) => (
                  <Badge key={dept.id} variant="default" className="gap-1.5 px-3 py-1.5 text-sm">
                    {dept.name}
                    <button
                      type="button"
                      className="rounded-full p-0.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                      onClick={() => {
                        if (window.confirm(t('whatsapp.deleteDeptConfirm'))) deleteDeptMutation.mutate(dept.id);
                      }}
                      aria-label={t('common.delete')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 ring-1 ring-slate-200/60">
                {t('whatsapp.noDepartments')}
              </p>
            )}
          </CardContent>
        </Card>

        {supportsCloudApi && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Cloud className="h-5 w-5 text-primary" />
                {t('whatsapp.webhookTitle')}
              </CardTitle>
              <CardDescription>{t('whatsapp.webhookDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0 text-sm text-slate-600">
              <div className="space-y-2">
                <Label>{t('whatsapp.callbackUrl')}</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input readOnly value={webhookUrl} className="h-11 text-xs" />
                  <Button type="button" variant="outline" className="h-11 shrink-0 w-full sm:w-auto" onClick={() => copyToClipboard(webhookUrl, 'url')}>
                    {copied === 'url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied === 'url' ? t('common.copied') : t('common.copy')}
                  </Button>
                </div>
              </div>
              {webhookVerifyToken && (
                <div className="space-y-2">
                  <Label>{t('whatsapp.verifyToken')}</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input readOnly value={webhookVerifyToken} className="h-11 text-xs font-mono" />
                    <Button type="button" variant="outline" className="h-11 shrink-0 w-full sm:w-auto" onClick={() => copyToClipboard(webhookVerifyToken, 'token')}>
                      {copied === 'token' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied === 'token' ? t('common.copied') : t('common.copy')}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">{t('whatsapp.webhookHint')}</p>
                </div>
              )}
              <ol className="list-inside list-decimal space-y-1.5 rounded-xl bg-slate-50 px-4 py-3 text-slate-600 ring-1 ring-slate-200/60">
                {webhookSteps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

interface AccountCardProps {
  account: WhatsAppAccount;
  departments: Department[];
  isExpanded: boolean;
  onToggle: () => void;
  connectionMode: 'qr' | 'api';
  supportsQr: boolean;
  supportsCloudApi: boolean;
  onConnectionModeChange: (mode: 'qr' | 'api') => void;
  activeQr: QrSession | null;
  cloudForm?: CloudApiFormState;
  cloudFeedback?: { type: 'success' | 'error'; text: string };
  testState?: { phone: string; message: string; feedback?: { type: 'success' | 'error'; text: string } };
  onCloudFormChange: (form: CloudApiFormState) => void;
  onTestChange: (state: { phone: string; message: string }) => void;
  onStartQr: () => void;
  onDisconnect: () => void;
  onDelete: () => void;
  onToggleActive: (active: boolean) => void;
  onSaveLabel: (label: string) => void;
  onSetDefault: () => void;
  onDepartmentsChange: (ids: string[]) => void;
  onCloudConnect: (form: CloudApiFormState) => void;
  onCancelQr: () => void;
  onRefreshQr: () => void;
  isQrPending: boolean;
  isCloudPending: boolean;
  isDisconnecting: boolean;
  isSavingLabel: boolean;
  onSendTest: () => void;
}

function AccountCard({
  account, departments, isExpanded, onToggle,
  connectionMode, supportsQr, supportsCloudApi, onConnectionModeChange,
  activeQr, cloudForm, cloudFeedback, testState, onCloudFormChange, onTestChange,
  onStartQr, onDisconnect, onDelete, onToggleActive, onSetDefault,
  onDepartmentsChange, onCloudConnect, onCancelQr, onRefreshQr,
  isQrPending, isCloudPending, isDisconnecting, isSavingLabel, onSaveLabel, onSendTest,
}: AccountCardProps) {
  const { t } = useTranslation();
  const [labelDraft, setLabelDraft] = useState(account.label || '');
  const isConnected = account.status === 'connected';
  const isReconnecting = account.status === 'reconnecting' || account.reconnecting;
  const isCloudConnected = isConnected && account.connection_type === 'api';
  const isQrConnected = isConnected && account.connection_type === 'qr';
  const selectedDeptIds = account.departments.map((d) => d.id);
  const showModeTabs = supportsQr && supportsCloudApi;
  const useQrPanel = connectionMode === 'qr' && supportsQr;
  const useCloudPanel = connectionMode === 'api' && supportsCloudApi;
  const lastSyncValue = account.last_synced_at || account.updated_at || null;
  const labelChanged = labelDraft.trim() !== (account.label || '').trim();

  useEffect(() => {
    setLabelDraft(account.label || '');
  }, [account.id, account.label]);

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
    <Card className={cn('overflow-hidden', !account.is_active && 'opacity-80')}>
      <button
        type="button"
        className="w-full text-left transition-colors hover:bg-slate-50/80"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <CardContent className="flex items-start gap-3 p-4 sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/10">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-semibold text-slate-900">{account.label || t('whatsapp.unnamed')}</p>
                {account.is_default && (
                  <Star className="h-4 w-4 shrink-0 fill-amber-500 text-amber-500" aria-hidden />
                )}
              </div>
              <p className="truncate text-sm text-slate-500">
                {account.phone_number || account.profile_name || t('whatsapp.notConnected')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden flex-wrap items-center justify-end gap-2 sm:flex">
              {account.connection_type === 'api' && (
                <Badge variant="default"><Cloud className="mr-1 h-3 w-3" /> {t('whatsapp.badgeCloud')}</Badge>
              )}
              {account.connection_type === 'qr' && isConnected && (
                <Badge variant="default"><QrCode className="mr-1 h-3 w-3" /> {t('whatsapp.badgeQr')}</Badge>
              )}
              {statusBadge}
            </div>
            <ChevronDown
              className={cn(
                'h-5 w-5 shrink-0 text-slate-400 transition-transform',
                isExpanded && 'rotate-180'
              )}
              aria-hidden
            />
          </div>
        </CardContent>
        <div className="flex flex-wrap gap-2 px-4 pb-4 sm:hidden">
          {account.connection_type === 'api' && (
            <Badge variant="default"><Cloud className="mr-1 h-3 w-3" /> {t('whatsapp.badgeCloud')}</Badge>
          )}
          {account.connection_type === 'qr' && isConnected && (
            <Badge variant="default"><QrCode className="mr-1 h-3 w-3" /> {t('whatsapp.badgeQr')}</Badge>
          )}
          {statusBadge}
        </div>
      </button>

      {isExpanded && (
        <CardContent className="space-y-6 border-t border-slate-100 bg-slate-50/40 pt-6">
          <SectionPanel title={t('whatsapp.sectionOverview')}>
            <div className="mb-4 space-y-2">
              <Label htmlFor={`wa-label-${account.id}`}>{t('whatsapp.profileName')}</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id={`wa-label-${account.id}`}
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  placeholder={t('whatsapp.profileNamePlaceholder')}
                  className="h-11 flex-1"
                />
                <Button
                  type="button"
                  className="h-11 w-full sm:w-auto"
                  disabled={!labelDraft.trim() || !labelChanged || isSavingLabel}
                  onClick={() => onSaveLabel(labelDraft)}
                >
                  {isSavingLabel ? <Spinner /> : <Save className="h-4 w-4" />}
                  {t('common.save')}
                </Button>
              </div>
              <p className="text-xs text-slate-500">{t('whatsapp.profileNameHint')}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow label={t('whatsapp.whatsappProfileName')} value={account.profile_name || '—'} />
              <InfoRow label={t('whatsapp.phoneNumber')} value={account.phone_number || '—'} />
              <InfoRow
                label={t('whatsapp.lastSync')}
                value={lastSyncValue ? new Date(lastSyncValue).toLocaleString() : '—'}
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
          </SectionPanel>

          <SectionPanel title={t('whatsapp.sectionManage')}>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                variant={account.is_active ? 'outline' : 'default'}
                size="sm"
                className="h-10 w-full sm:w-auto"
                onClick={() => onToggleActive(!account.is_active)}
              >
                <Power className="h-4 w-4" />
                {account.is_active ? t('whatsapp.setInactive') : t('whatsapp.setActive')}
              </Button>
              {!account.is_default && (
                <Button variant="outline" size="sm" className="h-10 w-full sm:w-auto" onClick={onSetDefault}>
                  <Star className="h-4 w-4" /> {t('whatsapp.setDefault')}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-10 w-full text-red-600 hover:bg-red-50 hover:text-red-700 sm:ml-auto sm:w-auto"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" /> {t('whatsapp.deleteAccount')}
              </Button>
            </div>
          </SectionPanel>

          {departments.length > 0 && (
            <SectionPanel title={t('whatsapp.linkDepartments')} icon={Link2}>
              <p className="mb-3 text-xs text-slate-500">{t('whatsapp.linkDepartmentsHint')}</p>
              <div className="flex flex-wrap gap-2">
                {departments.map((dept) => {
                  const selected = selectedDeptIds.includes(dept.id);
                  return (
                    <button
                      key={dept.id}
                      type="button"
                      className={cn(
                        'min-h-[40px] rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                        selected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
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
            </SectionPanel>
          )}

          <SectionPanel title={t('whatsapp.sectionConnection')}>
            {showModeTabs && (
              <div className="mb-4 space-y-2">
                <Label>{t('whatsapp.connectionMethod')}</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    className={cn(
                      'rounded-xl border p-3 text-left transition-colors',
                      connectionMode === 'qr'
                        ? 'border-primary bg-white ring-1 ring-primary'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    )}
                    onClick={() => onConnectionModeChange('qr')}
                  >
                    <div className="flex items-center gap-2 font-medium text-slate-900">
                      <QrCode className="h-4 w-4 shrink-0" />
                      {t('whatsapp.connectionQr')}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{t('whatsapp.connectionQrDesc')}</p>
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'rounded-xl border p-3 text-left transition-colors',
                      connectionMode === 'api'
                        ? 'border-primary bg-white ring-1 ring-primary'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    )}
                    onClick={() => onConnectionModeChange('api')}
                  >
                    <div className="flex items-center gap-2 font-medium text-slate-900">
                      <Cloud className="h-4 w-4 shrink-0" />
                      {t('whatsapp.connectionCloud')}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{t('whatsapp.connectionCloudDesc')}</p>
                  </button>
                </div>
                {isCloudConnected && connectionMode === 'qr' && (
                  <p className="text-xs text-amber-700">{t('whatsapp.disconnectCloudFirst')}</p>
                )}
                {isQrConnected && connectionMode === 'api' && (
                  <p className="text-xs text-amber-700">{t('whatsapp.disconnectQrFirst')}</p>
                )}
              </div>
            )}

            {useCloudPanel ? (
              <CloudApiForm
                account={account}
                form={cloudForm || {
                  phone_number: account.phone_number || '',
                  business_account_id:
                    account.connection_type === 'api' &&
                    account.business_account_id &&
                    !account.business_account_id.startsWith('baileys:')
                      ? account.business_account_id
                      : '',
                  access_token: '',
                  app_secret: '',
                }}
                onChange={onCloudFormChange}
                onConnect={onCloudConnect}
                onDisconnect={onDisconnect}
                isDisconnecting={isDisconnecting}
                isPending={isCloudPending}
                feedback={cloudFeedback}
              />
            ) : useQrPanel ? (
              isQrConnected ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" className="h-10 w-full sm:w-auto" onClick={onDisconnect} disabled={isDisconnecting}>
                    <Unplug className="h-4 w-4" /> {t('whatsapp.disconnect')}
                  </Button>
                  <Button variant="outline" className="h-10 w-full sm:w-auto" onClick={onStartQr}>
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
              )
            ) : null}
          </SectionPanel>

          {isConnected && (
            <SectionPanel title={t('whatsapp.sectionTest')}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('whatsapp.phoneNumber')}</Label>
                  <Input
                    value={testState?.phone || ''}
                    onChange={(e) => onTestChange({ phone: e.target.value, message: testState?.message || '' })}
                    placeholder="905551234567"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('whatsapp.testMessage')}</Label>
                  <Input
                    value={testState?.message || t('whatsapp.defaultTestMsg')}
                    onChange={(e) => onTestChange({ phone: testState?.phone || '', message: e.target.value })}
                    className="h-11"
                  />
                </div>
              </div>
              {testState?.feedback && (
                <div className={cn(
                  'mt-3 rounded-xl px-3 py-2 text-sm',
                  testState.feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-red-50 text-red-600 ring-1 ring-red-100'
                )}>
                  {testState.feedback.text}
                </div>
              )}
              <Button size="sm" className="mt-3 h-10 w-full sm:w-auto" onClick={onSendTest} disabled={!testState?.phone}>
                <Send className="h-4 w-4" /> {t('whatsapp.sendTest')}
              </Button>
            </SectionPanel>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200/80">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = 'default',
}: {
  icon: typeof Smartphone;
  label: string;
  value: string;
  hint: string;
  accent?: 'default' | 'success';
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3">
        <div className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1',
          accent === 'success' ? 'bg-emerald-50 text-emerald-600 ring-emerald-100' : 'bg-slate-50 text-slate-600 ring-slate-200'
        )}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-0.5 text-xl font-bold text-slate-900">{value}</p>
          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{hint}</p>
        </div>
      </div>
    </div>
  );
}

function SectionPanel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: typeof Link2;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 ring-1 ring-slate-100">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        {title}
      </h3>
      {children}
    </section>
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
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
        <p className="text-sm font-medium text-amber-800">{t('whatsapp.reconnectingTitle')}</p>
        <p className="text-sm text-amber-700">{t('whatsapp.reconnectingDesc')}</p>
        <Button className="h-10 w-full sm:w-auto" onClick={onStart} disabled={isPending}>
          {isPending ? <Spinner /> : <QrCode className="h-4 w-4" />}
          {t('whatsapp.reconnectWithQr')}
        </Button>
      </div>
    );
  }

  if (!activeQr) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6">
        <QrCode className="h-12 w-12 text-slate-300" />
        <Button className="h-11 w-full max-w-xs" onClick={onStart} disabled={isPending}>
          {isPending ? <span className="flex items-center gap-2"><Spinner /> {t('whatsapp.generatingQr')}</span> : t('whatsapp.generateQr')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <img src={activeQr.qr_data_url} alt="WhatsApp QR" className="h-52 w-52 rounded-2xl border-2 border-white bg-white p-3 shadow-sm sm:h-56 sm:w-56" />
      <StatusLabel status={activeQr.status} />
      <div className="flex w-full max-w-xs gap-2">
        <Button variant="outline" className="h-10 flex-1" onClick={onRefresh}>{t('whatsapp.refresh')}</Button>
        <Button variant="ghost" className="h-10 flex-1" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </div>
  );
}

function CloudApiForm({
  account, form, onChange, onConnect, onDisconnect, isDisconnecting, isPending, feedback,
}: {
  account: WhatsAppAccount;
  form: CloudApiFormState;
  onChange: (f: CloudApiFormState) => void;
  onConnect: (f: CloudApiFormState) => void;
  onDisconnect: () => void;
  isDisconnecting: boolean;
  isPending?: boolean;
  feedback?: { type: 'success' | 'error'; text: string };
}) {
  const { t } = useTranslation();
  const isConnected = account.status === 'connected' && account.connection_type === 'api';
  const canSubmit =
    form.phone_number.trim() &&
    form.business_account_id.trim() &&
    form.access_token.trim() &&
    form.app_secret.trim();

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
          <Cloud className="h-4 w-4 text-primary" /> {t('whatsapp.cloudApi')}
        </p>
        <p className="mt-1 text-xs text-slate-500">{t('whatsapp.cloudApiDesc')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t('whatsapp.businessPhone')}</Label>
          <Input value={form.phone_number} onChange={(e) => onChange({ ...form, phone_number: e.target.value })} placeholder={t('whatsapp.phonePlaceholder')} className="h-11" />
        </div>
        <div className="space-y-2">
          <Label>{t('whatsapp.phoneNumberId')}</Label>
          <Input value={form.business_account_id} onChange={(e) => onChange({ ...form, business_account_id: e.target.value })} placeholder={t('whatsapp.phoneNumberIdPlaceholder')} className="h-11" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t('whatsapp.accessToken')}</Label>
        <Input type="password" value={form.access_token} onChange={(e) => onChange({ ...form, access_token: e.target.value })} placeholder={t('whatsapp.accessTokenPlaceholder')} className="h-11" />
        {isConnected && (
          <p className="text-xs text-slate-500">{t('whatsapp.accessTokenKeepHint')}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label>{t('whatsapp.appSecret')}</Label>
        <Input type="password" value={form.app_secret} onChange={(e) => onChange({ ...form, app_secret: e.target.value })} placeholder={t('whatsapp.appSecretPlaceholder')} className="h-11" />
        <p className="text-xs text-slate-500">{t('whatsapp.appSecretHint')}</p>
      </div>
      {feedback && (
        <div className={cn('rounded-xl px-3 py-2 text-sm', feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-red-50 text-red-600 ring-1 ring-red-100')}>
          {feedback.text}
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="h-10 w-full sm:w-auto" onClick={() => onConnect(form)} disabled={!canSubmit || isPending}>
          {isPending ? <Spinner /> : null}
          {isConnected ? t('whatsapp.updateCloud') : t('whatsapp.connectCloud')}
        </Button>
        {isConnected && (
          <Button variant="outline" className="h-10 w-full sm:w-auto" onClick={onDisconnect} disabled={isDisconnecting}>
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
    pending: 'text-slate-600',
    scanned: 'text-primary',
    connected: 'text-emerald-600',
    expired: 'text-red-600',
    failed: 'text-red-600',
  };
  return <p className={cn('font-medium', colorMap[status] || colorMap.pending)}>{t(keys[status] || keys.pending)}</p>;
}
