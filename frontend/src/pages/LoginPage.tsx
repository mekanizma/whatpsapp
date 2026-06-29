/**
 * Müşteri paneli giriş sayfası
 */

import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MessageSquare, Shield, ArrowRight } from 'lucide-react';
import { useAuthStore, getRedirectPath } from '@/store/authStore';
import { isDemoMode } from '@/lib/env';
import { AuthShowcase, AuthMobileBanner } from '@/components/auth/AuthShowcase';
import { AuthFormShell } from '@/components/auth/AuthFormShell';
import { Button, Input, Label, Spinner } from '@/components/ui';

export function LoginPage() {
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
      setError(err instanceof Error ? err.message : 'Giriş başarısız');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <AuthMobileBanner variant="customer" />

      <div className="hidden min-h-screen w-1/2 lg:block">
        <AuthShowcase variant="customer" />
      </div>

      <AuthFormShell
        icon={<MessageSquare className="h-7 w-7 text-primary" />}
        title="Müşteri Paneli"
        subtitle="Şirket hesabınızla giriş yapın"
        onSubmit={handleSubmit}
        accent="teal"
        footer={
          <div className="space-y-3 text-center text-sm text-slate-500">
            <p>
              Platform yöneticisi?{' '}
              <Link
                to="/admin/login"
                className="inline-flex items-center gap-1 font-semibold text-slate-800 transition hover:text-primary"
              >
                <Shield className="h-3.5 w-3.5" />
                Admin Girişi
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </p>
            <p>
              Hesabınız yok mu?{' '}
              <Link to="/register" className="font-semibold text-primary hover:underline">
                Kayıt Ol
              </Link>
            </p>
          </div>
        }
      >
        {isDemoMode && (
          <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Demo hesaplar</p>
            <p className="mt-1 text-amber-800">firma@demo.com / personel@demo.com — demo123</p>
          </div>
        )}

        {error && (
          <div className="animate-fade-up rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">E-posta</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@sirket.com"
            className="transition focus:ring-2 focus:ring-primary/20"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Şifre</Label>
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
              Giriş Yap
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </>
          )}
        </Button>
      </AuthFormShell>
    </div>
  );
}
