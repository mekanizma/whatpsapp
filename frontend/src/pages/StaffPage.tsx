/**
 * Staff management page
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, UserX, Eye, EyeOff, Pencil, Save } from 'lucide-react';
import { api } from '@/services/api';
import { getErrorMessage } from '@/lib/errors';
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, Spinner, Badge } from '@/components/ui';
import type { StaffMember } from '@/types';

type StaffForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
};

const emptyForm: StaffForm = { name: '', email: '', phone: '', password: '' };

export function StaffPage() {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Pick<StaffForm, 'name' | 'email' | 'phone'>>({
    name: '',
    email: '',
    phone: '',
  });
  const queryClient = useQueryClient();

  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: () => api.get<StaffMember[]>('/staff'),
  });

  const resetCreateForm = () => {
    setForm(emptyForm);
    setShowPassword(false);
    setShowForm(false);
  };

  const createMutation = useMutation({
    mutationFn: (data: { name: string; email: string; password: string; phone?: string }) =>
      api.post('/staff', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      queryClient.invalidateQueries({ queryKey: ['notification-recipients'] });
      resetCreateForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; data: { name: string; email: string; phone?: string | null } }) =>
      api.put<StaffMember>(`/staff/${payload.id}`, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      queryClient.invalidateQueries({ queryKey: ['notification-recipients'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/staff/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      queryClient.invalidateQueries({ queryKey: ['notification-recipients'] });
    },
  });

  const canSubmit = form.name.trim() && form.email.trim() && form.password.length >= 6;
  const canSaveEdit = editForm.name.trim() && editForm.email.trim();

  const handleCreate = () => {
    if (!canSubmit) return;
    createMutation.mutate({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      phone: form.phone.trim() || undefined,
    });
  };

  const startEdit = (member: StaffMember) => {
    setEditingId(member.id);
    setEditForm({
      name: member.name,
      email: member.email,
      phone: member.phone || '',
    });
  };

  const handleSaveEdit = () => {
    if (!editingId || !canSaveEdit) return;
    updateMutation.mutate({
      id: editingId,
      data: {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim() || null,
      },
    });
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('staff.title')}</h1>
          <p className="text-gray-500">{t('staff.description')}</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" /> {t('staff.add')}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>{t('staff.new')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('staff.fullName')}</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={t('staff.fullNamePlaceholder')}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('common.email')}</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder={t('auth.emailPlaceholder')}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('staff.phone')}</Label>
                <Input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder={t('staff.phonePlaceholder')}
                  autoComplete="tel"
                />
                <p className="text-xs text-slate-500">{t('staff.phoneHint')}</p>
              </div>
              <div className="space-y-2">
                <Label>{t('common.password')}</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder={t('staff.passwordPlaceholder')}
                    autoComplete="new-password"
                    minLength={6}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t('settings.hidePasswords') : t('settings.showPasswords')}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500">{t('staff.passwordHint')}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleCreate} disabled={!canSubmit || createMutation.isPending}>
                {createMutation.isPending ? <Spinner /> : t('common.add')}
              </Button>
              <Button variant="outline" onClick={resetCreateForm}>{t('common.cancel')}</Button>
              {createMutation.isError && (
                <p className="w-full text-sm text-rose-600">{getErrorMessage(createMutation.error)}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center p-8"><Spinner className="h-8 w-8" /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {staff?.map((member) => (
            <Card key={member.id}>
              <CardContent className="p-4">
                {editingId === member.id ? (
                  <div className="space-y-3">
                    <p className="font-medium text-slate-900">{t('staff.editStaff')}</p>
                    <div className="space-y-2">
                      <Label>{t('staff.fullName')}</Label>
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('common.email')}</Label>
                      <Input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('staff.phone')}</Label>
                      <Input
                        type="tel"
                        value={editForm.phone}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                        placeholder={t('staff.phonePlaceholder')}
                      />
                    </div>
                    {updateMutation.isError && (
                      <p className="text-sm text-rose-600">{getErrorMessage(updateMutation.error)}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={handleSaveEdit} disabled={!canSaveEdit || updateMutation.isPending}>
                        {updateMutation.isPending ? <Spinner /> : <><Save className="h-4 w-4" />{t('staff.save')}</>}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{member.name}</p>
                      <p className="text-sm text-gray-500">{member.email}</p>
                      {member.phone && (
                        <p className="text-sm text-slate-600">{member.phone}</p>
                      )}
                      <Badge variant="info" className="mt-1">
                        {t(`common.roles.${member.role}`, { defaultValue: member.role })}
                      </Badge>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => startEdit(member)}
                        className="rounded-lg p-2 hover:bg-slate-100"
                        aria-label={t('staff.edit')}
                      >
                        <Pencil className="h-4 w-4 text-slate-500" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(member.id)}
                        className="rounded-lg p-2 hover:bg-red-50"
                        aria-label={t('common.delete')}
                      >
                        <UserX className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
