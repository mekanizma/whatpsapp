/**
 * Staff management page
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, UserX, Eye, EyeOff } from 'lucide-react';
import { api } from '@/services/api';
import { getErrorMessage } from '@/lib/errors';
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, Spinner, Badge } from '@/components/ui';
import type { StaffMember } from '@/types';

export function StaffPage() {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const queryClient = useQueryClient();

  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: () => api.get<StaffMember[]>('/staff'),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; email: string; password: string }) => api.post('/staff', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setShowForm(false);
      setName('');
      setEmail('');
      setPassword('');
      setShowPassword(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/staff/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  });

  const canSubmit = name.trim() && email.trim() && password.length >= 6;

  const handleCreate = () => {
    if (!canSubmit) return;
    createMutation.mutate({ name: name.trim(), email: email.trim(), password });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('staff.title')}</h1>
          <p className="text-gray-500">{t('staff.description')}</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> {t('staff.add')}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>{t('staff.new')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>{t('staff.fullName')}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('staff.fullNamePlaceholder')}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('common.email')}</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('common.password')}</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
              <Button variant="outline" onClick={() => setShowForm(false)}>{t('common.cancel')}</Button>
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
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{member.name}</p>
                  <p className="text-sm text-gray-500">{member.email}</p>
                  <Badge variant="info" className="mt-1">
                    {t(`common.roles.${member.role}`, { defaultValue: member.role })}
                  </Badge>
                </div>
                <button onClick={() => deleteMutation.mutate(member.id)} className="p-2 hover:bg-red-50 rounded-lg">
                  <UserX className="h-4 w-4 text-red-500" />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
