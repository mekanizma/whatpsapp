/**
 * Super admin — AI prompt yönetimi (rol tabanlı)
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, RotateCcw, Save, Trash2, ChevronRight, Sparkles } from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
  Badge,
  Button,
  Input,
  Label,
  Textarea,
} from '@/components/ui';
import type { AIPromptTemplate, PromptRole } from '@/types';
import { cn } from '@/lib/utils';

const CORE_ROLES: PromptRole[] = ['greeting', 'system', 'appointment', 'language', 'translation'];

const ROLE_LABELS: Record<PromptRole, string> = {
  greeting: 'admin.prompts.roleGreeting',
  system: 'admin.prompts.roleSystem',
  appointment: 'admin.prompts.roleAppointment',
  language: 'admin.prompts.roleLanguage',
  translation: 'admin.prompts.roleTranslation',
  custom: 'admin.prompts.roleCustom',
};

const ROLE_DESC: Record<PromptRole, string> = {
  greeting: 'admin.prompts.roleGreetingDesc',
  system: 'admin.prompts.roleSystemDesc',
  appointment: 'admin.prompts.roleAppointmentDesc',
  language: 'admin.prompts.roleLanguageDesc',
  translation: 'admin.prompts.roleTranslationDesc',
  custom: 'admin.prompts.roleCustomDesc',
};

const DEFAULT_KEYS = new Set(['system']);

const EMPTY_FORM = {
  prompt_key: '',
  prompt_role: 'custom' as PromptRole,
  name: '',
  description: '',
  content: '',
  sort_order: '0',
};

export function AdminPromptsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editContent, setEditContent] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const { data: prompts, isLoading } = useQuery({
    queryKey: ['admin-prompts'],
    queryFn: () => api.get<AIPromptTemplate[]>('/admin/prompts'),
  });

  const corePrompts = useMemo(
    () => prompts?.filter((p) => CORE_ROLES.includes(p.prompt_role)) || [],
    [prompts]
  );

  const customPrompts = useMemo(
    () => prompts?.filter((p) => p.prompt_role === 'custom') || [],
    [prompts]
  );

  const selected = prompts?.find((p) => p.prompt_key === selectedKey) || null;
  const isDefaultKey = selected ? DEFAULT_KEYS.has(selected.prompt_key) : false;

  const saveMutation = useMutation({
    mutationFn: (body: { key: string; data: Record<string, string> }) =>
      api.put(`/admin/prompts/${body.key}`, body.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-prompts'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, string | number>) =>
      api.post<AIPromptTemplate>('/admin/prompts', body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-prompts'] });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setSelectedKey(data.prompt_key);
      setEditContent(data.content);
      setEditName(data.name);
      setEditDescription(data.description || '');
    },
  });

  const resetMutation = useMutation({
    mutationFn: (key: string) => api.post<AIPromptTemplate>(`/admin/prompts/${key}/reset`, {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-prompts'] });
      setEditContent(data.content);
      setEditName(data.name);
      setEditDescription(data.description || '');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => api.delete(`/admin/prompts/${key}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-prompts'] });
      setSelectedKey(null);
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: () => api.post<{ removed: number; reset: number }>('/admin/prompts-cleanup', {}),
    onSuccess: async () => {
      setSelectedKey(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-prompts'] });
    },
  });

  const openPrompt = (p: AIPromptTemplate) => {
    setSelectedKey(p.prompt_key);
    setShowCreate(false);
    setEditContent(p.content);
    setEditName(p.name);
    setEditDescription(p.description || '');
  };

  const handleSave = () => {
    if (!selected) return;
    saveMutation.mutate({
      key: selected.prompt_key,
      data: {
        name: editName,
        description: editDescription,
        content: editContent,
      },
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      prompt_key: form.prompt_key,
      prompt_role: form.prompt_role,
      name: form.name,
      description: form.description,
      content: form.content,
      sort_order: Number(form.sort_order) || 0,
    });
  };

  const renderPromptButton = (p: AIPromptTemplate) => (
    <button
      key={p.prompt_key}
      type="button"
      onClick={() => openPrompt(p)}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all',
        selectedKey === p.prompt_key
          ? 'border-amber-300 bg-amber-50/60 ring-1 ring-amber-200'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
        <FileText className="h-4 w-4 text-slate-600" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-slate-900">{p.name}</p>
          <Badge variant={p.is_active ? 'success' : 'warning'}>
            {p.is_active ? t('common.active') : t('common.inactive')}
          </Badge>
        </div>
        <p className="mt-0.5 font-mono text-xs text-slate-500">{p.prompt_key}</p>
        <p className="mt-2 text-[10px] font-medium uppercase text-slate-400">
          {t(ROLE_LABELS[p.prompt_role])} · v{p.version}
        </p>
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 lg:hidden" />
    </button>
  );

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.prompts.title')}
        description={t('admin.prompts.descriptionNew')}
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => {
                if (window.confirm(t('admin.prompts.cleanupConfirm'))) {
                  cleanupMutation.mutate();
                }
              }}
              disabled={cleanupMutation.isPending}
            >
              <RotateCcw className="h-4 w-4" />
              {t('admin.prompts.cleanup')}
            </Button>
            <Button
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => {
                setShowCreate(true);
                setSelectedKey(null);
              }}
            >
              <Plus className="h-4 w-4" />
              {t('admin.prompts.addNew')}
            </Button>
          </div>
        }
      />

      <Card className="border-sky-100 bg-sky-50/40">
        <CardContent className="flex gap-3 p-4 text-sm text-sky-900">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t('admin.prompts.howItWorks')}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-5">
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t('admin.prompts.coreTitle')} ({corePrompts.length})
            </p>
            <p className="text-xs text-slate-500">{t('admin.prompts.coreHint')}</p>
            <div className="space-y-2">{corePrompts.map(renderPromptButton)}</div>
          </section>

          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t('admin.prompts.customTitle')} ({customPrompts.length})
            </p>
            <p className="text-xs text-slate-500">{t('admin.prompts.customHint')}</p>

            {showCreate && (
              <Card className="border-amber-200 ring-1 ring-amber-100">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">{t('admin.prompts.createTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreate} className="space-y-3">
                    <div>
                      <Label>{t('admin.prompts.role')}</Label>
                      <select
                        value={form.prompt_role}
                        onChange={(e) =>
                          setForm({ ...form, prompt_role: e.target.value as PromptRole })
                        }
                        className="mt-1 flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                      >
                        {[...CORE_ROLES, 'custom'].map((role) => (
                          <option key={role} value={role}>
                            {t(ROLE_LABELS[role as PromptRole])}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">
                        {t(ROLE_DESC[form.prompt_role])}
                      </p>
                    </div>
                    <div>
                      <Label>{t('admin.prompts.key')}</Label>
                      <Input
                        value={form.prompt_key}
                        onChange={(e) => setForm({ ...form, prompt_key: e.target.value })}
                        placeholder="ornek_kural"
                        required
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>{t('admin.prompts.name')}</Label>
                      <Input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        required
                        className="mt-1"
                      />
                    </div>
                    {form.prompt_role === 'custom' && (
                      <div>
                        <Label>{t('admin.prompts.sortOrder')}</Label>
                        <Input
                          type="number"
                          value={form.sort_order}
                          onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                    )}
                    <div>
                      <Label>{t('admin.prompts.fieldDescription')}</Label>
                      <Input
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>{t('admin.prompts.content')}</Label>
                      <Textarea
                        value={form.content}
                        onChange={(e) => setForm({ ...form, content: e.target.value })}
                        rows={8}
                        required
                        className="mt-1 font-mono text-xs"
                      />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button type="submit" disabled={createMutation.isPending} className="flex-1">
                        {createMutation.isPending ? t('common.saving') : t('common.add')}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                    {createMutation.isError && (
                      <p className="text-sm font-medium text-red-600">
                        {createMutation.error?.message}
                      </p>
                    )}
                  </form>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              {customPrompts.length === 0 && !showCreate && (
                <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                  {t('admin.prompts.noCustom')}
                </p>
              )}
              {customPrompts.map(renderPromptButton)}
            </div>
          </section>
        </div>

        <Card className={cn(!selected && !showCreate && 'hidden lg:block')}>
          {selected ? (
            <>
              <CardHeader className="border-b border-slate-100">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">{editName}</CardTitle>
                      <Badge variant="default">{t(ROLE_LABELS[selected.prompt_role])}</Badge>
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-500">{selected.prompt_key}</p>
                    <p className="mt-2 text-xs text-slate-500">{t(ROLE_DESC[selected.prompt_role])}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isDefaultKey && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resetMutation.mutate(selected.prompt_key)}
                        disabled={resetMutation.isPending}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {t('admin.prompts.reset')}
                      </Button>
                    )}
                    {!isDefaultKey && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => {
                          if (window.confirm(t('admin.prompts.deleteConfirm'))) {
                            deleteMutation.mutate(selected.prompt_key);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t('common.delete')}
                      </Button>
                    )}
                    <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
                      <Save className="h-3.5 w-3.5" />
                      {saveMutation.isPending ? t('common.saving') : t('common.save')}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                <div>
                  <Label>{t('admin.prompts.name')}</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{t('admin.prompts.fieldDescription')}</Label>
                  <Input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="mt-1"
                  />
                </div>

                {selected.variables.length > 0 && (
                  <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3">
                    <p className="text-xs font-semibold text-sky-800">{t('admin.prompts.variables')}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selected.variables.map((v) => (
                        <code
                          key={v}
                          className="rounded-md bg-white px-2 py-0.5 text-xs text-sky-700 ring-1 ring-sky-200"
                        >
                          {`{{${v}}}`}
                        </code>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-sky-700/80">{t('admin.prompts.variablesHint')}</p>
                  </div>
                )}

                <div>
                  <Label>{t('admin.prompts.content')}</Label>
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={18}
                    className="mt-1 font-mono text-xs leading-relaxed"
                  />
                </div>

                {selected.is_active ? (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    {t('admin.prompts.activeAiPrompt')}
                  </p>
                ) : (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {t('admin.prompts.inactiveWarning')}
                  </p>
                )}

                <p className="text-xs text-slate-400">
                  {t('admin.prompts.liveNote')} · {t('admin.prompts.updatedAt')}{' '}
                  {new Date(selected.updated_at).toLocaleString()}
                </p>

                {saveMutation.isSuccess && (
                  <p className="text-sm font-medium text-emerald-600">{t('admin.prompts.saved')}</p>
                )}
                {(saveMutation.isError || deleteMutation.isError) && (
                  <p className="text-sm font-medium text-red-600">
                    {(saveMutation.error || deleteMutation.error)?.message}
                  </p>
                )}
              </CardContent>
            </>
          ) : (
            <CardContent className="flex min-h-[280px] flex-col items-center justify-center p-8 text-center">
              <FileText className="mb-3 h-10 w-10 text-slate-300" />
              <p className="font-medium text-slate-600">{t('admin.prompts.selectHint')}</p>
              <p className="mt-1 max-w-xs text-sm text-slate-400">{t('admin.prompts.selectHintSub')}</p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
