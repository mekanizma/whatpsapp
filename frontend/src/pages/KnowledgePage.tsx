/**
 * Knowledge base management page
 */

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Upload, FileText, X, RefreshCw, Eye, PenLine, Power } from 'lucide-react';
import { api } from '@/services/api';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import {
  KNOWLEDGE_ACCEPTED_FILES,
  isMarkdownContent,
  isTextKnowledgeFile,
  titleFromKnowledgeFilename,
} from '@/lib/knowledge-files';
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
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { authQueryKey } from '@/lib/query-keys';
import type { Department, KnowledgeItem, ParsedKnowledgeFile } from '@/types';

type ContentView = 'edit' | 'preview';

function indexStatusVariant(status?: KnowledgeItem['index_status']) {
  switch (status) {
    case 'ready':
      return 'success' as const;
    case 'indexing':
    case 'pending':
      return 'warning' as const;
    case 'failed':
      return 'danger' as const;
    default:
      return 'default' as const;
  }
}

export function KnowledgePage() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'company_admin';
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<KnowledgeItem | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [uploadInfo, setUploadInfo] = useState<ParsedKnowledgeFile | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [contentView, setContentView] = useState<ContentView>('edit');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: items, isPending } = useQuery({
    queryKey: authQueryKey(['knowledge'], user?.id, user?.role),
    queryFn: () => api.get<KnowledgeItem[]>('/knowledge'),
    enabled: !!user?.id,
    refetchInterval: (query) => {
      const list = query.state.data;
      const hasPending = list?.some((item) =>
        item.index_status === 'pending' || item.index_status === 'indexing'
      );
      return hasPending ? 3000 : false;
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: authQueryKey(['departments'], user?.id, user?.role),
    queryFn: () => api.get<Department[]>('/departments'),
    enabled: isAdmin && !!user?.id,
  });

  const requiresDepartment = departments.length > 0;

  const saveMutation = useMutation({
    mutationFn: (data: {
      title: string;
      content: string;
      category: string;
      source_filename?: string;
      department_id?: string;
    }) =>
      editItem
        ? api.put(`/knowledge/${editItem.id}`, data)
        : api.post('/knowledge', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      resetForm();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.upload<ParsedKnowledgeFile>('/knowledge/parse-file', file),
    onSuccess: (data) => {
      setUploadError('');
      setUploadInfo(data);
      if (!title.trim()) setTitle(data.title);
      setContent(data.content);
      if (!category.trim() && data.file_type) {
        setCategory(data.file_type);
      }
    },
    onError: (err: Error) => {
      setUploadError(err.message);
      setUploadInfo(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/knowledge/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['knowledge'] }),
  });

  const reindexMutation = useMutation({
    mutationFn: (id: string) => api.post(`/knowledge/${id}/reindex`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['knowledge'] }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch<KnowledgeItem>(`/knowledge/${id}/active`, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['knowledge'] }),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditItem(null);
    setTitle('');
    setContent('');
    setCategory('');
    setDepartmentId('');
    setUploadInfo(null);
    setUploadError('');
    setContentView('edit');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openEdit = (item: KnowledgeItem) => {
    setEditItem(item);
    setTitle(item.title);
    setContent(item.content);
    setCategory(item.category || '');
    setDepartmentId(item.department_id || item.department?.id || '');
    setUploadInfo(null);
    setUploadError('');
    setContentView('edit');
    setShowForm(true);
  };

  const showMarkdownPreview = isMarkdownContent(
    content,
    uploadInfo?.source_filename ?? editItem?.source_filename,
    uploadInfo?.file_type ?? null
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');

    if (isTextKnowledgeFile(file)) {
      try {
        const text = await file.text();
        if (text.trim()) {
          const derivedTitle = titleFromKnowledgeFilename(file.name);
          if (!title.trim()) setTitle(derivedTitle || file.name);
          setContent(text);
          setContentView('preview');
        }
      } catch {
        setUploadError(t('knowledge.fileReadError'));
      }
    }

    uploadMutation.mutate(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('knowledge.title')}</h1>
          <p className="text-gray-500">{t('knowledge.description')}</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" /> {t('knowledge.add')}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editItem ? t('knowledge.edit') : t('knowledge.new')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!editItem && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <Upload className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{t('knowledge.upload')}</p>
                      <p className="text-xs text-slate-500">{t('knowledge.uploadHint')}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={uploadMutation.isPending}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadMutation.isPending ? (
                      <>
                        <Spinner className="h-4 w-4" />
                        {t('knowledge.reading')}
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4" />
                        {t('knowledge.selectFile')}
                      </>
                    )}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={KNOWLEDGE_ACCEPTED_FILES}
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                {uploadInfo && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-200/60">
                    <span className="font-medium">{uploadInfo.source_filename}</span>
                    <Badge variant="success">{uploadInfo.file_type}</Badge>
                    <span>{t('knowledge.charsRead', { count: uploadInfo.char_count.toLocaleString(locale) })}</span>
                    <span>{t('knowledge.chunkEstimate', { count: uploadInfo.chunk_estimate })}</span>
                    {uploadInfo.truncated && (
                      <span className="text-amber-700">{t('knowledge.truncated')}</span>
                    )}
                    <button
                      type="button"
                      className="ml-auto rounded p-0.5 hover:bg-emerald-100"
                      onClick={() => {
                        setUploadInfo(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      aria-label={t('knowledge.removeFile')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {uploadError && (
                  <p className="mt-3 text-sm text-red-600">{uploadError}</p>
                )}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('knowledge.titleLabel')}</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('knowledge.titlePlaceholder')} />
              </div>
              <div className="space-y-2">
                <Label>{t('knowledge.category')}</Label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('knowledge.categoryPlaceholder')} />
              </div>
              {isAdmin && requiresDepartment && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t('knowledge.department')}</Label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40"
                  >
                    <option value="">{t('knowledge.selectDepartment')}</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label>{t('knowledge.content')}</Label>
                {showMarkdownPreview && (
                  <div className="flex w-full rounded-lg border border-slate-200 p-0.5 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setContentView('edit')}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium sm:flex-none',
                        contentView === 'edit' ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      <PenLine className="h-3.5 w-3.5" />
                      {t('knowledge.editContent')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setContentView('preview')}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium sm:flex-none',
                        contentView === 'preview' ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {t('knowledge.previewContent')}
                    </button>
                  </div>
                )}
              </div>
              {contentView === 'preview' && showMarkdownPreview ? (
                <MarkdownPreview content={content} />
              ) : (
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  placeholder={t('knowledge.contentPlaceholder')}
                  className="min-h-[10rem] font-mono text-sm"
                />
              )}
              <p className="text-xs text-slate-500">{t('knowledge.contentHint')}</p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={resetForm} className="w-full sm:w-auto">
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() =>
                  saveMutation.mutate({
                    title,
                    content,
                    category,
                    source_filename: uploadInfo?.source_filename,
                    ...(isAdmin && departmentId ? { department_id: departmentId } : {}),
                  })
                }
                disabled={
                  saveMutation.isPending ||
                  !title.trim() ||
                  !content.trim() ||
                  (isAdmin && requiresDepartment && !departmentId)
                }
                className="w-full sm:w-auto"
              >
                {saveMutation.isPending ? <Spinner /> : t('common.save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isPending ? (
        <div className="flex justify-center p-8"><Spinner className="h-8 w-8" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items?.map((item) => (
            <Card key={item.id} className={cn(!item.is_active && 'opacity-75')}>
              <CardContent className="p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-snug">{item.title}</h3>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        toggleActiveMutation.mutate({ id: item.id, is_active: !item.is_active })
                      }
                      className="rounded p-1 hover:bg-gray-100"
                      title={item.is_active ? t('knowledge.setInactive') : t('knowledge.setActive')}
                      disabled={toggleActiveMutation.isPending}
                      aria-label={item.is_active ? t('knowledge.setInactive') : t('knowledge.setActive')}
                    >
                      <Power className={cn('h-4 w-4', item.is_active ? 'text-emerald-600' : 'text-gray-400')} />
                    </button>
                    <button
                      type="button"
                      onClick={() => reindexMutation.mutate(item.id)}
                      className="rounded p-1 hover:bg-gray-100"
                      title={t('knowledge.reindex')}
                      disabled={reindexMutation.isPending || !item.is_active}
                    >
                      <RefreshCw className={`h-4 w-4 text-gray-500 ${item.index_status === 'indexing' ? 'animate-spin' : ''}`} />
                    </button>
                    <button type="button" onClick={() => openEdit(item)} className="rounded p-1 hover:bg-gray-100">
                      <Pencil className="h-4 w-4 text-gray-500" />
                    </button>
                    <button type="button" onClick={() => deleteMutation.mutate(item.id)} className="rounded p-1 hover:bg-red-50">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                </div>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {!item.is_active && (
                    <Badge variant="warning">
                      <Power className="mr-1 h-3 w-3" />
                      {t('knowledge.inactive')}
                    </Badge>
                  )}
                  {item.category && <Badge variant="info">{item.category}</Badge>}
                  {item.department?.name && <Badge variant="default">{item.department.name}</Badge>}
                  {item.index_status && (
                    <Badge variant={indexStatusVariant(item.index_status)}>
                      {t(`knowledge.indexStatus.${item.index_status}`)}
                    </Badge>
                  )}
                  {typeof item.chunk_count === 'number' && item.chunk_count > 0 && (
                    <Badge variant="default">
                      {t('knowledge.chunks', { count: item.chunk_count })}
                    </Badge>
                  )}
                </div>
                {item.index_error && (
                  <p className="mb-2 text-xs text-red-600 line-clamp-2">{item.index_error}</p>
                )}
                <p className="line-clamp-4 whitespace-pre-wrap text-sm text-gray-600">{item.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
