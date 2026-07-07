/**
 * Kayıt sayfası — işletme hesabı oluşturma
 */

import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2, Building2, User, Phone, Mail, Lock } from 'lucide-react';
import { WaaiLogo } from '@/components/WaaiLogo';
import { useAuthStore } from '@/store/authStore';
import { AuthPageLayout } from '@/components/auth/AuthPageLayout';
import { AuthFormShell } from '@/components/auth/AuthFormShell';
import { Button, Input, Label, Spinner } from '@/components/ui';

const CATEGORY_KEYS = [
  'restoran', 'otel', 'rent_a_car', 'guzellik_merkezi', 'klinik',
  'dis_hekimi', 'emlak', 'universite', 'kurs', 'diger',
] as const;

export function RegisterPage() {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [category, setCategory] = useState<string>('restoran');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register({ email, password, fullName, phone, companyName, category });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.registerFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout variant="customer">
      <AuthFormShell
        icon={<WaaiLogo className="auth-form-logo" />}
        title={t('auth.createAccount')}
        subtitle={t('auth.registerSubtitle')}
        onSubmit={success ? undefined : handleSubmit}
        accent="teal"
        footer={
          <p className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-center text-sm">
            <span>{t('auth.hasAccount')}</span>
            <Link to="/login" className="font-semibold text-teal-300 hover:text-teal-200 hover:underline">
              {t('auth.login')}
            </Link>
          </p>
        }
      >
        {success ? (
          <div className="animate-fade-up flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="text-sm font-medium text-emerald-800">{t('auth.registerSuccess')}</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="animate-fade-up rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="companyName">{t('auth.companyName')}</Label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={t('auth.companyNamePlaceholder')}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">{t('auth.category')}</Label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex h-10 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {CATEGORY_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {t(`auth.categories.${key}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">{t('auth.fullName')}</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('auth.fullNamePlaceholder')}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">{t('auth.phone')}</Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t('auth.phonePlaceholder')}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('common.email')}</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('auth.emailPlaceholder')}
                    className="pl-9"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('common.password')}</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9"
                  minLength={6}
                  required
                />
              </div>
              <p className="text-xs text-slate-500">{t('auth.passwordHint')}</p>
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
                  {t('auth.register')}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </>
        )}
      </AuthFormShell>
    </AuthPageLayout>
  );
}
