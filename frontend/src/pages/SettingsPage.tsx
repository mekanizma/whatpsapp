/**
 * Müşteri paneli — hesap ve şirket ayarları
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { User, Building2, Lock, Save, Eye, EyeOff } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
} from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { supabase, supabaseConfigured } from '@/services/supabase';
import { isDemoMode } from '@/lib/env';
import type { Company } from '@/types';

const CATEGORY_VALUES = [
  'universite', 'klinik', 'dis_hekimi', 'guzellik_merkezi', 'emlak',
  'rent_a_car', 'otel', 'restoran', 'kurs', 'diger',
];

export function SettingsPage() {
  const { t } = useTranslation();
  const { user, company, updateProfile, updateCompany, changePassword } = useAuthStore();

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState(user?.full_name || '');

  const [companyName, setCompanyName] = useState(company?.company_name || '');
  const [companyPhone, setCompanyPhone] = useState(company?.phone || '');
  const [companyEmail, setCompanyEmail] = useState(company?.email || '');
  const [companyAddress, setCompanyAddress] = useState(company?.address || '');
  const [companyCategory, setCompanyCategory] = useState(company?.category || 'diger');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [companyMsg, setCompanyMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const isAdmin = user?.role === 'company_admin';
  const roleLabel = user?.role ? t(`common.roles.${user.role}`, { defaultValue: user.role }) : '';

  useEffect(() => {
    setFullName(user?.full_name || '');
  }, [user]);

  useEffect(() => {
    setCompanyName(company?.company_name || '');
    setCompanyPhone(company?.phone || '');
    setCompanyEmail(company?.email || '');
    setCompanyAddress(company?.address || '');
    setCompanyCategory(company?.category || 'diger');
  }, [company]);

  useEffect(() => {
    async function loadEmail() {
      if (isDemoMode) {
        const demoEmails: Record<string, string> = {
          company_admin: 'firma@demo.com',
          staff: 'personel@demo.com',
        };
        setEmail(demoEmails[user?.role || ''] || '');
        return;
      }
      if (!supabaseConfigured) return;
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email || '');
    }
    loadEmail();
  }, [user?.role]);

  const profileMutation = useMutation({
    mutationFn: () => updateProfile({ full_name: fullName.trim() }),
    onSuccess: () => {
      setProfileMsg({ type: 'ok', text: t('settings.profileSaved') });
    },
    onError: (err: Error) => {
      setProfileMsg({ type: 'err', text: err.message });
    },
  });

  const companyMutation = useMutation({
    mutationFn: () =>
      updateCompany({
        company_name: companyName.trim(),
        phone: companyPhone.trim() || null,
        email: companyEmail.trim() || null,
        address: companyAddress.trim() || null,
        category: companyCategory,
      } as Partial<Company>),
    onSuccess: () => {
      setCompanyMsg({ type: 'ok', text: t('settings.companySaved') });
    },
    onError: (err: Error) => {
      setCompanyMsg({ type: 'err', text: err.message });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setPasswordMsg({ type: 'ok', text: t('settings.passwordSaved') });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err: Error) => {
      setPasswordMsg({ type: 'err', text: err.message });
    },
  });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'err', text: t('settings.passwordMin') });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'err', text: t('settings.passwordMismatch') });
      return;
    }
    passwordMutation.mutate();
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title={t('settings.title')}
        description={t('settings.description')}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              {t('settings.personalInfo')}
            </CardTitle>
            <CardDescription>{t('settings.personalDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fullName">{t('settings.fullName')}</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('settings.fullNamePlaceholder')}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('common.email')}</Label>
                <Input id="email" value={email} disabled className="bg-slate-50" />
                <p className="text-xs text-slate-500">{t('settings.emailChangeHint')}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="info" className="capitalize">{roleLabel}</Badge>
            </div>
            {profileMsg && (
              <p className={profileMsg.type === 'ok' ? 'text-sm text-emerald-600' : 'text-sm text-red-600'}>
                {profileMsg.text}
              </p>
            )}
            <Button
              onClick={() => {
                setProfileMsg(null);
                profileMutation.mutate();
              }}
              disabled={profileMutation.isPending || !fullName.trim()}
              className="w-full sm:w-auto"
            >
              <Save className="h-4 w-4" />
              {profileMutation.isPending ? t('common.saving') : t('settings.saveProfile')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              {t('settings.changePassword')}
            </CardTitle>
            <CardDescription>{t('settings.passwordDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {isDemoMode ? (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200/60">
                {t('settings.demoPassword')}
              </p>
            ) : (
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">{t('settings.currentPassword')}</Label>
                  <Input
                    id="currentPassword"
                    type={showPasswords ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">{t('settings.newPassword')}</Label>
                  <Input
                    id="newPassword"
                    type={showPasswords ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t('settings.confirmPassword')}</Label>
                  <Input
                    id="confirmPassword"
                    type={showPasswords ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
                  onClick={() => setShowPasswords((v) => !v)}
                >
                  {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {showPasswords ? t('settings.hidePasswords') : t('settings.showPasswords')}
                </button>
                {passwordMsg && (
                  <p className={passwordMsg.type === 'ok' ? 'text-sm text-emerald-600' : 'text-sm text-red-600'}>
                    {passwordMsg.text}
                  </p>
                )}
                <Button type="submit" disabled={passwordMutation.isPending} className="w-full">
                  {passwordMutation.isPending ? t('settings.updating') : t('settings.updatePassword')}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {isAdmin && company && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                {t('settings.companyInfo')}
              </CardTitle>
              <CardDescription>{t('settings.companyDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">{t('settings.companyName')}</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyCategory">{t('settings.category')}</Label>
                <select
                  id="companyCategory"
                  value={companyCategory}
                  onChange={(e) => setCompanyCategory(e.target.value)}
                  className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm shadow-sm focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/25"
                >
                  {CATEGORY_VALUES.map((value) => (
                    <option key={value} value={value}>{t(`common.categories.${value}`)}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="companyPhone">{t('settings.phone')}</Label>
                  <Input
                    id="companyPhone"
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    type="tel"
                    placeholder="+90..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyEmail">{t('common.email')}</Label>
                  <Input
                    id="companyEmail"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    type="email"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyAddress">{t('settings.address')}</Label>
                <Input
                  id="companyAddress"
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                />
              </div>
              {companyMsg && (
                <p className={companyMsg.type === 'ok' ? 'text-sm text-emerald-600' : 'text-sm text-red-600'}>
                  {companyMsg.text}
                </p>
              )}
              <Button
                onClick={() => {
                  setCompanyMsg(null);
                  companyMutation.mutate();
                }}
                disabled={companyMutation.isPending || !companyName.trim()}
                className="w-full"
              >
                <Save className="h-4 w-4" />
                {companyMutation.isPending ? t('common.saving') : t('settings.saveCompany')}
              </Button>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}

