import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, UserPlus } from 'lucide-react';
import { api } from '@/services/api';
import { ResetPasswordForm } from '@/components/ResetPasswordForm';
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
  Badge,
} from '@/components/ui';
import { cn } from '@/lib/utils';

type CompanyUser = {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  email?: string | null;
};

interface AdminCompanyLoginAccountProps {
  companyId: string;
  users: CompanyUser[];
}

export function AdminCompanyLoginAccount({ companyId, users }: AdminCompanyLoginAccountProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [createForm, setCreateForm] = useState({
    full_name: '',
    email: '',
    password: '',
  });

  const companyAdmins = users.filter((u) => u.role === 'company_admin');

  const passwordMutation = useMutation({
    mutationFn: ({ profileId, password }: { profileId: string; password: string }) =>
      api.patch(`/admin/users/${profileId}/password`, { password }),
    onSuccess: () => {
      setFeedback({ type: 'ok', text: t('admin.users.passwordSaved') });
    },
    onError: (err: Error) => {
      setFeedback({ type: 'err', text: err.message });
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: { email: string; password: string; full_name: string }) =>
      api.post(`/admin/companies/${companyId}/login-user`, body),
    onSuccess: () => {
      setFeedback({ type: 'ok', text: t('admin.companyDetail.loginAccount.created') });
      setCreateForm({ full_name: '', email: '', password: '' });
      queryClient.invalidateQueries({ queryKey: ['admin-company', companyId] });
    },
    onError: (err: Error) => {
      setFeedback({ type: 'err', text: err.message });
    },
  });

  const handleCreate = () => {
    setFeedback(null);
    if (!createForm.full_name.trim() || !createForm.email.trim()) {
      setFeedback({ type: 'err', text: t('admin.companyDetail.loginAccount.requiredFields') });
      return;
    }
    if (createForm.password.length < 6) {
      setFeedback({ type: 'err', text: t('admin.companies.passwordTooShort') });
      return;
    }
    createMutation.mutate({
      full_name: createForm.full_name.trim(),
      email: createForm.email.trim().toLowerCase(),
      password: createForm.password,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <KeyRound className="h-5 w-5 text-slate-500" aria-hidden />
          {t('admin.companyDetail.loginAccount.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">{t('admin.companyDetail.loginAccount.description')}</p>

        {feedback && (
          <p className={cn('text-sm', feedback.type === 'ok' ? 'text-emerald-600' : 'text-rose-600')}>
            {feedback.text}
          </p>
        )}

        {companyAdmins.length > 0 ? (
          <div className="space-y-4">
            {companyAdmins.map((admin) => (
              <div
                key={admin.id}
                className="rounded-xl border border-slate-200 bg-slate-50/80 p-4"
              >
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{admin.full_name}</p>
                    <p className="text-sm text-slate-500">{admin.email || '—'}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(admin.created_at).toLocaleDateString(locale)}
                    </p>
                  </div>
                  <Badge variant={admin.is_active ? 'success' : 'warning'}>
                    {admin.is_active ? t('common.active') : t('common.inactive')}
                  </Badge>
                </div>

                <p className="mb-3 text-sm font-medium text-slate-700">
                  {t('admin.companyDetail.loginAccount.changePassword')}
                </p>
                <ResetPasswordForm
                  isPending={passwordMutation.isPending}
                  submitLabel={t('admin.users.savePassword')}
                  onSubmit={(password) => {
                    setFeedback(null);
                    passwordMutation.mutate({ profileId: admin.id, password });
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
              <UserPlus className="h-4 w-4" aria-hidden />
              {t('admin.companyDetail.loginAccount.createTitle')}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>{t('auth.fullName')}</Label>
                <Input
                  className="h-11"
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.companies.loginEmail')}</Label>
                <Input
                  type="email"
                  className="h-11"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('common.password')}</Label>
                <Input
                  type="password"
                  className="h-11"
                  minLength={6}
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                />
              </div>
            </div>
            <Button
              className="mt-4 min-h-[44px] w-full sm:w-auto"
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? <Spinner /> : t('admin.companyDetail.loginAccount.create')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
