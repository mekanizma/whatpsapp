/**
 * Knowledge base management page
 */

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Upload, FileText, X } from 'lucide-react';
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
import type { KnowledgeItem, ParsedKnowledgeFile } from '@/types';

const ACCEPTED_FILES = '.pdf,.docx,.xlsx,.xls';

export function KnowledgePage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<KnowledgeItem | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [uploadInfo, setUploadInfo] = useState<ParsedKnowledgeFile | null>(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ['knowledge'],
    queryFn: () => api.get<KnowledgeItem[]>('/knowledge'),
  });

  const saveMutation = useMutation({
    mutationFn: (data: { title: string; content: string; category: string }) =>
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

  const resetForm = () => {
    setShowForm(false);
    setEditItem(null);
    setTitle('');
    setContent('');
    setCategory('');
    setUploadInfo(null);
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openEdit = (item: KnowledgeItem) => {
    setEditItem(item);
    setTitle(item.title);
    setContent(item.content);
    setCategory(item.category || '');
    setUploadInfo(null);
    setUploadError('');
    setShowForm(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
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
                    accept={ACCEPTED_FILES}
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                {uploadInfo && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-200/60">
                    <span className="font-medium">{uploadInfo.source_filename}</span>
                    <Badge variant="success">{uploadInfo.file_type}</Badge>
                    <span>{t('knowledge.charsRead', { count: uploadInfo.char_count.toLocaleString(locale) })}</span>
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
            </div>
            <div className="space-y-2">
              <Label>{t('knowledge.content')}</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                placeholder={t('knowledge.contentPlaceholder')}
                className="min-h-[10rem] font-mono text-sm"
              />
              <p className="text-xs text-slate-500">{t('knowledge.contentHint')}</p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={resetForm} className="w-full sm:w-auto">
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => saveMutation.mutate({ title, content, category })}
                disabled={saveMutation.isPending || !title.trim() || !content.trim()}
                className="w-full sm:w-auto"
              >
                {saveMutation.isPending ? <Spinner /> : t('common.save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center p-8"><Spinner className="h-8 w-8" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items?.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="font-semibold">{item.title}</h3>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(item)} className="rounded p-1 hover:bg-gray-100">
                      <Pencil className="h-4 w-4 text-gray-500" />
                    </button>
                    <button onClick={() => deleteMutation.mutate(item.id)} className="rounded p-1 hover:bg-red-50">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                </div>
                {item.category && <Badge variant="info" className="mb-2">{item.category}</Badge>}
                <p className="line-clamp-4 whitespace-pre-wrap text-sm text-gray-600">{item.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
