/**
 * Admin paneli giriş sayfası
 */

import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Shield, MessageSquare, ArrowRight } from 'lucide-react';
import { useAuthStore, getRedirectPath } from '@/store/authStore';
import { isDemoMode } from '@/lib/env';
import { AuthPageLayout } from '@/components/auth/AuthPageLayout';
import { AuthFormShell } from '@/components/auth/AuthFormShell';
import { Button, Input, Label, Spinner } from '@/components/ui';

export function AdminLoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState(isDemoMode ? 'admin@demo.com' : '');
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
      await login(email, password, 'admin');
      navigate(getRedirectPath('super_admin'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout variant="admin">
      <AuthFormShell
        icon={<Shield className="h-7 w-7 text-amber-400" />}
        title={t('auth.adminLogin')}
        subtitle={t('auth.adminSubtitle')}
        onSubmit={handleSubmit}
        accent="amber"
        footer={
          <p className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-center text-sm">
            <span>{t('auth.customerAccount')}</span>
            <Link
              to="/login"
              className="inline-flex items-center gap-1 font-semibold text-amber-300 transition hover:text-amber-200 hover:underline"
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
              {t('auth.customerLogin')}
              <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            </Link>
          </p>
        }
      >
        {isDemoMode && (
          <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 p-4 text-sm text-amber-900">
            {t('auth.demoAdmin')}
          </div>
        )}

        {error && (
          <div className="animate-fade-up rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="admin-email">{t('common.email')}</Label>
          <Input
            id="admin-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.adminEmailPlaceholder')}
            className="transition focus:ring-2 focus:ring-amber-500/20"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin-password">{t('common.password')}</Label>
          <Input
            id="admin-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="transition focus:ring-2 focus:ring-amber-500/20"
            required
          />
        </div>

        <Button
          type="submit"
          className="group w-full bg-slate-900 shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 hover:shadow-xl"
          size="lg"
          disabled={loading}
        >
          {loading ? (
            <Spinner />
          ) : (
            <>
              {t('auth.adminPanelLogin')}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </>
          )}
        </Button>

        <p className="text-center text-xs text-slate-500">
          {t('auth.adminOnly')}
        </p>
      </AuthFormShell>
    </AuthPageLayout>
  );
}
