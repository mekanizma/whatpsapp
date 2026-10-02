/**
 * Departman bazlı hazır cevap yönetimi
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Power, MessageSquareText } from 'lucide-react';
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
import { isSuperStaff } from '@/lib/staff-permissions';
import type { Department, QuickReply } from '@/types';

export function QuickRepliesPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'company_admin';
  const canPickDepartment = isAdmin || isSuperStaff(user?.staff_role);
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<QuickReply | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<QuickReply | null>(null);
  const [formError, setFormError] = useState('');

  const { data: items = [], isPending } = useQuery({
    queryKey: authQueryKey(['quick-replies'], user?.id, user?.role),
    queryFn: () => api.get<QuickReply[]>('/quick-replies'),
    enabled: !!user?.id,
  });

  const { data: departments = [] } = useQuery({
    queryKey: authQueryKey(['departments'], user?.id, user?.role),
    queryFn: () => api.get<Department[]>('/departments'),
    enabled: canPickDepartment && !!user?.id,
  });

  const requiresDepartment = canPickDepartment && departments.length > 0;

  const resetForm = () => {
    setShowForm(false);
    setEditItem(null);
    setTitle('');
    setBody('');
    setDepartmentId('');
    setFormError('');
  };

  const openCreate = () => {
    setEditItem(null);
    setTitle('');
    setBody('');
    setDepartmentId(departments[0]?.id || '');
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (item: QuickReply) => {
    setEditItem(item);
    setTitle(item.title);
    setBody(item.body);
    setDepartmentId(item.department_id || '');
    setFormError('');
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: (data: { title: string; body: string; department_id?: string }) =>
      editItem
        ? api.put(`/quick-replies/${editItem.id}`, data)
        : api.post('/quick-replies', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
      resetForm();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.put(`/quick-replies/${id}`, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quick-replies'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/quick-replies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
      setDeleteTarget(null);
    },
  });

  const handleSave = () => {
    setFormError('');
    if (!title.trim() || !body.trim()) {
      setFormError(t('quickReplies.required'));
      return;
    }
    if (requiresDepartment && !departmentId) {
      setFormError(t('quickReplies.selectDepartment'));
      return;
    }
    saveMutation.mutate({
      title: title.trim(),
      body: body.trim(),
      ...(requiresDepartment ? { department_id: departmentId } : {}),
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('quickReplies.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('quickReplies.description')}</p>
        </div>
        <Button className="min-h-[44px] w-full sm:w-auto" onClick={openCreate}>
          <Plus className="h-4 w-4" /> {t('quickReplies.add')}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">
              {editItem ? t('quickReplies.edit') : t('quickReplies.new')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('quickReplies.titleLabel')}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('quickReplies.titlePlaceholder')}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('quickReplies.bodyLabel')}</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t('quickReplies.bodyPlaceholder')}
                rows={5}
                className="min-h-[120px]"
              />
            </div>
            {requiresDepartment && (
              <div className="space-y-2">
                <Label>{t('quickReplies.department')}</Label>
                <select
                  className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                >
                  <option value="">{t('quickReplies.selectDepartment')}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
          icon={MessageSquareText}
          title={t('quickReplies.empty')}
          description={t('quickReplies.emptyDesc')}
        />
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <Card key={item.id} className={!item.is_active ? 'opacity-60' : undefined}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{item.title}</h3>
                    {item.department?.name && (
                      <Badge variant="default">{item.department.name}</Badge>
                    )}
                    {!item.is_active && (
                      <Badge variant="warning">{t('quickReplies.inactive')}</Badge>
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
                    title={item.is_active ? t('quickReplies.setInactive') : t('quickReplies.setActive')}
                    aria-label={item.is_active ? t('quickReplies.setInactive') : t('quickReplies.setActive')}
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
                    title={t('quickReplies.edit')}
                    aria-label={t('quickReplies.edit')}
                    onClick={() => openEdit(item)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-10 w-10 text-red-600 hover:text-red-700"
                    title={t('quickReplies.delete')}
                    aria-label={t('quickReplies.delete')}
                    onClick={() => setDeleteTarget(item)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
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
            <h3 className="text-base font-semibold text-slate-900">{t('quickReplies.deleteConfirm')}</h3>
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
                {t('quickReplies.delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
