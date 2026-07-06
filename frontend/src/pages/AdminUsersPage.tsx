/**
 * Super admin — platform kullanıcıları ve şifre yönetimi
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Lock, Users } from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { ResetPasswordForm } from '@/components/ResetPasswordForm';
import {
  Button,
  Input,
  Card,
  CardContent,
  Spinner,
  Badge,
} from '@/components/ui';
import type { PlatformUser } from '@/types';
import { isDemoMode } from '@/lib/env';

export function AdminUsersPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const [search, setSearch] = useState('');
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () => api.getWithMeta<PlatformUser[]>(`/admin/users?search=${encodeURIComponent(search)}`),
  });

  const passwordMutation = useMutation({
    mutationFn: ({ profileId, password }: { profileId: string; password: string }) =>
      api.patch(`/admin/users/${profileId}/password`, { password }),
    onSuccess: () => {
      setFeedback({ type: 'ok', text: t('admin.users.passwordSaved') });
      setResetUserId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: Error) => {
      setFeedback({ type: 'err', text: err.message });
    },
  });

  const users = data?.data || [];

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title={t('admin.users.title')}
        description={t('admin.users.description')}
      />

      {isDemoMode && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200/60">
          {t('settings.demoPassword')}
        </p>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="h-11 pl-9"
          placeholder={t('admin.users.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {feedback && (
        <p className={feedback.type === 'ok' ? 'text-sm text-emerald-600' : 'text-sm text-red-600'}>
          {feedback.text}
        </p>
      )}

      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner className="h-8 w-8" /></div>
      ) : isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Users className="h-10 w-10 text-rose-300" />
            <p className="text-sm text-rose-600">
              {error instanceof Error ? error.message : t('admin.users.loadError')}
            </p>
          </CardContent>
        </Card>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Users className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500">{t('admin.users.noUsers')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {users.map((user) => {
            const roleText = t(`common.roles.${user.role}`, { defaultValue: user.role });
            const isResetOpen = resetUserId === user.id;

            return (
              <Card key={user.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{user.full_name}</p>
                      <p className="text-sm text-slate-500">{user.email || '—'}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="info" className="capitalize">{roleText}</Badge>
                        <Badge variant={user.is_active ? 'success' : 'warning'}>
                          {user.is_active ? t('common.active') : t('common.inactive')}
                        </Badge>
                        {user.company_name && (
                          <span className="text-xs text-slate-500">{user.company_name}</span>
                        )}
                        <span className="text-xs text-slate-400">
                          {new Date(user.created_at).toLocaleDateString(locale)}
                        </span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant={isResetOpen ? 'outline' : 'secondary'}
                      className="w-full min-h-[44px] sm:w-auto"
                      disabled={isDemoMode}
                      onClick={() => {
                        setFeedback(null);
                        setResetUserId(isResetOpen ? null : user.id);
                      }}
                    >
                      <Lock className="h-4 w-4" />
                      {isResetOpen ? t('common.cancel') : t('admin.users.resetPassword')}
                    </Button>
                  </div>

                  {isResetOpen && (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <p className="mb-3 text-sm text-slate-600">{t('admin.users.resetPasswordDesc')}</p>
                      <ResetPasswordForm
                        isPending={passwordMutation.isPending}
                        submitLabel={t('admin.users.savePassword')}
                        onSubmit={(password) => {
                          setFeedback(null);
                          passwordMutation.mutate({ profileId: user.id, password });
                        }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
