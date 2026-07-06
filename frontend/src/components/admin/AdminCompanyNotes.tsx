/**
 * Super admin — şirket içi notlar (sadece platform yöneticileri görür)
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StickyNote, Plus, Trash2, Lock } from 'lucide-react';
import { api } from '@/services/api';
import {
  Button,
  Label,
  Textarea,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
} from '@/components/ui';
import type { CompanyAdminNote } from '@/types';

interface AdminCompanyNotesProps {
  companyId: string;
}

export function AdminCompanyNotes({ companyId }: AdminCompanyNotesProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: notes, isLoading, isError } = useQuery({
    queryKey: ['admin-company-notes', companyId],
    queryFn: () => api.get<CompanyAdminNote[]>(`/admin/companies/${companyId}/notes`),
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: (body: { content: string }) =>
      api.post<CompanyAdminNote>(`/admin/companies/${companyId}/notes`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-company-notes', companyId] });
      setContent('');
      setFormError(null);
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) =>
      api.delete(`/admin/companies/${companyId}/notes/${noteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-company-notes', companyId] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) {
      setFormError(t('admin.companyDetail.notes.emptyError'));
      return;
    }
    createMutation.mutate({ content: trimmed });
  };

  const list = notes || [];

  return (
    <div className="space-y-4">
      <Card className="border-amber-200/60 bg-gradient-to-br from-amber-50/30 via-white to-white">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <StickyNote className="h-5 w-5 text-amber-600" />
            {t('admin.companyDetail.notes.addTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="admin-note-content" className="sr-only">
                {t('admin.companyDetail.notes.placeholder')}
              </Label>
              <Textarea
                id="admin-note-content"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder={t('admin.companyDetail.notes.placeholder')}
                rows={4}
                className="min-h-[100px] resize-y"
              />
            </div>
            {formError && <p className="text-sm text-rose-600">{formError}</p>}
            <Button
              type="submit"
              disabled={createMutation.isPending || !content.trim()}
              className="w-full min-h-[44px] sm:w-auto"
            >
              {createMutation.isPending ? (
                <Spinner />
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  {t('admin.companyDetail.notes.add')}
                </>
              )}
            </Button>
          </form>
          <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t('admin.companyDetail.notes.privacyHint')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {t('admin.companyDetail.notes.historyTitle')}
            {list.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-500">({list.length})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-7 w-7" />
            </div>
          ) : isError ? (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {t('admin.companyDetail.notes.loadError')}
            </p>
          ) : list.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center">
              <StickyNote className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">
                {t('admin.companyDetail.notes.empty')}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {t('admin.companyDetail.notes.emptyHint')}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {list.map((note) => (
                <li
                  key={note.id}
                  className="group rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                    {note.content}
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-500">
                      {note.author_name} ·{' '}
                      {new Date(note.created_at).toLocaleString(locale, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-[40px] self-start text-rose-600 hover:bg-rose-50 hover:text-rose-700 sm:self-auto sm:opacity-0 sm:transition group-hover:sm:opacity-100"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm(t('admin.companyDetail.notes.deleteConfirm'))) {
                          deleteMutation.mutate(note.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('admin.companyDetail.notes.delete')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
