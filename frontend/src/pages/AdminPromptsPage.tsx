/**
 * Super admin — AI prompt yönetimi
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, RotateCcw, Save, ChevronRight } from 'lucide-react';
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
import type { AIPromptTemplate } from '@/types';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<string, string> = {
  ai_system: 'admin.prompts.catSystem',
  appointment: 'admin.prompts.catAppointment',
  language: 'admin.prompts.catLanguage',
  translation: 'admin.prompts.catTranslation',
  custom: 'admin.prompts.catCustom',
  general: 'admin.prompts.catGeneral',
};

const EMPTY_FORM = {
  prompt_key: '',
  name: '',
  description: '',
  category: 'custom',
  content: '',
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

  const selected = prompts?.find((p) => p.prompt_key === selectedKey) || null;

  const saveMutation = useMutation({
    mutationFn: (body: { key: string; data: Record<string, string> }) =>
      api.put(`/admin/prompts/${body.key}`, body.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-prompts'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api.post<AIPromptTemplate>('/admin/prompts', body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-prompts'] });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setSelectedKey(data.prompt_key);
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

  const resetAllMutation = useMutation({
    mutationFn: () => api.post<{ reset: number; seeded: number }>('/admin/prompts-reset-all', {}),
    onSuccess: async () => {
      const refreshed = await queryClient.fetchQuery({
        queryKey: ['admin-prompts'],
        queryFn: () => api.get<AIPromptTemplate[]>('/admin/prompts'),
      });
      if (selectedKey) {
        const p = refreshed?.find((x) => x.prompt_key === selectedKey);
        if (p) {
          setEditContent(p.content);
          setEditName(p.name);
          setEditDescription(p.description || '');
        }
      }
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
      name: form.name,
      description: form.description,
      category: form.category,
      content: form.content,
    });
  };

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
        description={t('admin.prompts.description')}
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => {
                if (window.confirm(t('admin.prompts.resetAllConfirm'))) {
                  resetAllMutation.mutate();
                }
              }}
              disabled={resetAllMutation.isPending}
            >
              <RotateCcw className="h-4 w-4" />
              {t('admin.prompts.resetAll')}
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Liste — mobilde üstte */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.prompts.listTitle')} ({prompts?.length || 0})
          </p>

          {showCreate && (
            <Card className="border-amber-200 ring-1 ring-amber-100">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{t('admin.prompts.createTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="space-y-3">
                  <div>
                    <Label>{t('admin.prompts.key')}</Label>
                    <Input
                      value={form.prompt_key}
                      onChange={(e) => setForm({ ...form, prompt_key: e.target.value })}
                      placeholder="ornek_prompt"
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
            {prompts?.map((p) => (
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
                  <p className="mt-0.5 text-xs text-slate-500">{p.prompt_key}</p>
                  {p.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">{p.description}</p>
                  )}
                  <p className="mt-2 text-[10px] font-medium uppercase text-slate-400">
                    {t(CATEGORY_LABELS[p.category] || CATEGORY_LABELS.general)} · v{p.version}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 lg:hidden" />
              </button>
            ))}
          </div>
        </div>

        {/* Düzenleyici */}
        <Card className={cn(!selected && !showCreate && 'hidden lg:block')}>
          {selected ? (
            <>
              <CardHeader className="border-b border-slate-100">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-base">{editName}</CardTitle>
                    <p className="mt-1 font-mono text-xs text-slate-500">{selected.prompt_key}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => resetMutation.mutate(selected.prompt_key)}
                      disabled={resetMutation.isPending}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t('admin.prompts.reset')}
                    </Button>
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

                <p className="text-xs text-slate-400">
                  {t('admin.prompts.liveNote')} · {t('admin.prompts.updatedAt')}{' '}
                  {new Date(selected.updated_at).toLocaleString()}
                </p>

                {saveMutation.isSuccess && (
                  <p className="text-sm font-medium text-emerald-600">{t('admin.prompts.saved')}</p>
                )}
                {(saveMutation.isError || createMutation.isError) && (
                  <p className="text-sm font-medium text-red-600">
                    {(saveMutation.error || createMutation.error)?.message}
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
