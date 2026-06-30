/**
 * Müşteri paneli giriş sayfası
 */

import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Shield, ArrowRight } from 'lucide-react';
import { useAuthStore, getRedirectPath } from '@/store/authStore';
import { isDemoMode } from '@/lib/env';
import { AuthPageLayout } from '@/components/auth/AuthPageLayout';
import { AuthFormShell } from '@/components/auth/AuthFormShell';
import { Button, Input, Label, Spinner } from '@/components/ui';

export function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState(isDemoMode ? 'firma@demo.com' : '');
  const [password, setPassword] = useState(isDemoMode ? 'demo123' : '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, 'customer');
      const user = useAuthStore.getState().user;
      navigate(getRedirectPath(user?.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout variant="customer">
      <AuthFormShell
        icon={<MessageSquare className="h-7 w-7 text-teal-400" />}
        title={t('auth.customerPanel')}
        subtitle={t('auth.customerSubtitle')}
        onSubmit={handleSubmit}
        accent="teal"
        footer={
          <div className="space-y-3 text-center text-sm">
            <p>
              {t('auth.platformAdmin')}{' '}
              <Link
                to="/admin/login"
                className="inline-flex items-center gap-1 font-semibold text-teal-300 transition hover:text-teal-200"
              >
                <Shield className="h-3.5 w-3.5" />
                {t('auth.adminLogin')}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </p>
            <p>
              {t('auth.noAccount')}{' '}
              <Link to="/register" className="font-semibold text-teal-300 hover:text-teal-200 hover:underline">
                {t('auth.register')}
              </Link>
            </p>
          </div>
        }
      >
        {isDemoMode && (
          <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">{t('auth.demoAccounts')}</p>
            <p className="mt-1 text-amber-800">{t('auth.demoHint')}</p>
          </div>
        )}

        {error && (
          <div className="animate-fade-up rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">{t('common.email')}</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.emailPlaceholder')}
            className="transition focus:ring-2 focus:ring-primary/20"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t('common.password')}</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="transition focus:ring-2 focus:ring-primary/20"
            required
          />
        </div>

        <Button
          type="submit"
          className="group w-full shadow-lg shadow-primary/20 transition hover:shadow-xl hover:shadow-primary/25"
          size="lg"
          disabled={loading}
        >
          {loading ? (
            <Spinner />
          ) : (
            <>
              {t('auth.login')}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </>
          )}
        </Button>
      </AuthFormShell>
    </AuthPageLayout>
  );
}
