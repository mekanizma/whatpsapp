/**
 * Hat bazlı Meta outreach şablon yönetimi (24s pencere dışı)
 * Şirket yöneticisi ve süper personel
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Power, FileText } from 'lucide-react';
import { api } from '@/services/api';
import {
  Button,
  Input,
  Label,
  Textarea,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
  Badge,
} from '@/components/ui';
import { EmptyState } from '@/components/EmptyState';
import { useAuthStore } from '@/store/authStore';
import { authQueryKey } from '@/lib/query-keys';
import { canManageWaOutreachTemplates } from '@/lib/staff-permissions';
import type { WaOutreachTemplate } from '@/types';

type OutreachLine = {
  id: string;
  label: string | null;
  phone_number: string | null;
  profile_name: string | null;
  status: string;
  is_active: boolean;
};

function lineLabel(line: OutreachLine): string {
  return (
    line.label?.trim() ||
    line.profile_name?.trim() ||
    line.phone_number?.trim() ||
    line.id.slice(0, 8)
  );
}

export function OutreachTemplatesPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const canManage = canManageWaOutreachTemplates(user);
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<WaOutreachTemplate | null>(null);
  const [title, setTitle] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [language, setLanguage] = useState('en');
  const [body, setBody] = useState('');
  const [accountId, setAccountId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<WaOutreachTemplate | null>(null);
  const [formError, setFormError] = useState('');

  const { data: items = [], isPending } = useQuery({
    queryKey: authQueryKey(['outreach-templates'], user?.id, user?.role),
    queryFn: () => api.get<WaOutreachTemplate[]>('/outreach-templates'),
    enabled: !!user?.id && canManage,
  });

  const { data: waAccountsData } = useQuery({
    queryKey: ['whatsapp-accounts'],
    queryFn: () => api.get<{ accounts: OutreachLine[] }>('/whatsapp/accounts'),
    enabled: canManage && !!user?.id,
  });

  const lines = (waAccountsData?.accounts || []).filter((a) => a.is_active);

  const resetForm = () => {
    setShowForm(false);
    setEditItem(null);
    setTitle('');
    setTemplateName('');
    setLanguage('en');
    setBody('');
    setAccountId('');
    setFormError('');
  };

  const openCreate = () => {
    setEditItem(null);
    setTitle('');
    setTemplateName('');
    setLanguage('en');
    setBody('');
    setAccountId(lines[0]?.id || '');
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (item: WaOutreachTemplate) => {
    setEditItem(item);
    setTitle(item.title);
    setTemplateName(item.template_name);
    setLanguage(item.language || 'en');
    setBody(item.body);
    setAccountId(item.whatsapp_account_id);
    setFormError('');
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: (data: {
      title: string;
      template_name: string;
      language: string;
      body: string;
      whatsapp_account_id: string;
    }) =>
      editItem
        ? api.put(`/outreach-templates/${editItem.id}`, data)
        : api.post('/outreach-templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-templates'] });
      queryClient.invalidateQueries({ queryKey: ['outreach-template'] });
      resetForm();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put(`/outreach-templates/${id}`, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-templates'] });
      queryClient.invalidateQueries({ queryKey: ['outreach-template'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/outreach-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-templates'] });
      queryClient.invalidateQueries({ queryKey: ['outreach-template'] });
      setDeleteTarget(null);
    },
  });

  const handleSave = () => {
    setFormError('');
    if (!title.trim() || !templateName.trim() || !body.trim() || !accountId) {
      setFormError(t('outreachTemplates.required'));
      return;
    }
    saveMutation.mutate({
      title: title.trim(),
      template_name: templateName.trim(),
      language: language.trim() || 'en',
      body: body.trim(),
      whatsapp_account_id: accountId,
    });
  };

  if (!canManage) {
    return (
      <EmptyState
        icon={FileText}
        title={t('outreachTemplates.noAccess')}
        description={t('outreachTemplates.noAccessDesc')}
      />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            {t('outreachTemplates.title')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t('outreachTemplates.description')}</p>
        </div>
        <Button
          className="min-h-[44px] w-full sm:w-auto"
          onClick={openCreate}
          disabled={lines.length === 0}
        >
          <Plus className="h-4 w-4" /> {t('outreachTemplates.add')}
        </Button>
      </div>

      {lines.length === 0 && (
        <p className="rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-950 ring-1 ring-amber-200/80">
          {t('outreachTemplates.noLines')}
        </p>
      )}

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">
              {editItem ? t('outreachTemplates.edit') : t('outreachTemplates.new')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('outreachTemplates.line')}</Label>
              <select
                className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">{t('outreachTemplates.selectLine')}</option>
                {lines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {lineLabel(line)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t('outreachTemplates.titleLabel')}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('outreachTemplates.titlePlaceholder')}
                className="min-h-[44px]"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('outreachTemplates.templateName')}</Label>
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder={t('outreachTemplates.templateNamePlaceholder')}
                  className="min-h-[44px]"
                />
                <p className="text-xs text-slate-500">{t('outreachTemplates.templateNameHint')}</p>
              </div>
              <div className="space-y-2">
                <Label>{t('outreachTemplates.language')}</Label>
                <Input
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="en"
                  className="min-h-[44px]"
                />
                <p className="text-xs text-slate-500">{t('outreachTemplates.languageHint')}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('outreachTemplates.bodyLabel')}</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t('outreachTemplates.bodyPlaceholder')}
                rows={5}
                className="min-h-[120px]"
              />
              <p className="text-xs text-slate-500">{t('outreachTemplates.bodyHint')}</p>
            </div>
            {formError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-100">
                {formError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" className="min-h-[44px]" onClick={resetForm}>
                {t('common.cancel')}
              </Button>
              <Button className="min-h-[44px]" disabled={saveMutation.isPending} onClick={handleSave}>
                {saveMutation.isPending ? <Spinner /> : null}
                {t('common.save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isPending ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t('outreachTemplates.empty')}
          description={t('outreachTemplates.emptyDesc')}
        />
      ) : (
        <div className="grid gap-3">
          {items.map((item) => {
            const lineName =
              item.whatsapp_account
                ? lineLabel({
                    id: item.whatsapp_account.id,
                    label: item.whatsapp_account.label,
                    phone_number: item.whatsapp_account.phone_number,
                    profile_name: item.whatsapp_account.profile_name,
                    status: 'connected',
                    is_active: true,
                  })
                : item.whatsapp_account_id.slice(0, 8);

            return (
              <Card key={item.id} className={!item.is_active ? 'opacity-60' : undefined}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{item.title}</h3>
                      <Badge variant="default">{lineName}</Badge>
                      <Badge variant="info">{item.template_name}</Badge>
                      <span className="text-xs text-slate-500">{item.language}</span>
                      {!item.is_active && (
                        <Badge variant="warning">{t('outreachTemplates.inactive')}</Badge>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600 line-clamp-4">
                      {item.body}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1 self-end sm:self-start">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-10 w-10"
                      title={
                        item.is_active
                          ? t('outreachTemplates.setInactive')
                          : t('outreachTemplates.setActive')
                      }
                      aria-label={
                        item.is_active
                          ? t('outreachTemplates.setInactive')
                          : t('outreachTemplates.setActive')
                      }
                      onClick={() =>
                        toggleMutation.mutate({ id: item.id, is_active: !item.is_active })
                      }
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-10 w-10"
                      title={t('outreachTemplates.edit')}
                      aria-label={t('outreachTemplates.edit')}
                      onClick={() => openEdit(item)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-10 w-10 text-red-600 hover:text-red-700"
                      title={t('outreachTemplates.delete')}
                      aria-label={t('outreachTemplates.delete')}
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !deleteMutation.isPending && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">
              {t('outreachTemplates.deleteConfirm')}
            </h3>
            <p className="mt-2 text-sm text-slate-500">{deleteTarget.title}</p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                className="min-h-[44px]"
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteTarget(null)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                className="min-h-[44px]"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
              >
                {deleteMutation.isPending ? <Spinner /> : null}
                {t('outreachTemplates.delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
