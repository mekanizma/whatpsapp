/**
 * Müşteri paneli — hesap ve şirket ayarları
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { User, Building2, Lock, Save, Eye, EyeOff, Bell, ImagePlus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { CompanyLogo } from '@/components/CompanyLogo';
import { SettingsTabNav, type SettingsTabId } from '@/components/settings/SettingsTabNav';
import { SettingsFeedback } from '@/components/settings/SettingsFeedback';
import {
  Button,
  Input,
  Label,
  Textarea,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Spinner,
} from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/services/api';
import { supabase, supabaseConfigured } from '@/services/supabase';
import { CompanyCategorySelect } from '@/components/CompanyCategorySelect';
import { DEFAULT_COMPANY_CATEGORY } from '@/lib/company-categories';
import { isDemoMode } from '@/lib/env';
import type { Company, NotificationUser } from '@/types';

const CUSTOM_INSTRUCTIONS_MAX_LENGTH = 1500;

export function SettingsPage() {
  const { t } = useTranslation();
  const { user, company, updateProfile, updateCompany, uploadCompanyLogo, removeCompanyLogo, changePassword } = useAuthStore();

  const [activeTab, setActiveTab] = useState<SettingsTabId>('profile');

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [personalPhone, setPersonalPhone] = useState(user?.phone || '');

  const [companyName, setCompanyName] = useState(company?.company_name || '');
  const [companyPhone, setCompanyPhone] = useState(company?.phone || '');
  const [companyEmail, setCompanyEmail] = useState(company?.email || '');
  const [companyAddress, setCompanyAddress] = useState(company?.address || '');
  const [companyCategory, setCompanyCategory] = useState(company?.category || DEFAULT_COMPANY_CATEGORY);
  const [customInstructions, setCustomInstructions] = useState(company?.custom_instructions || '');

  const customInstructionsTrimmed = customInstructions.trim();
  const customInstructionsOverLimit = customInstructionsTrimmed.length > CUSTOM_INSTRUCTIONS_MAX_LENGTH;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [companyMsg, setCompanyMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [logoMsg, setLogoMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [notificationMsg, setNotificationMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [notificationUsers, setNotificationUsers] = useState<NotificationUser[]>([]);

  const isAdmin = user?.role === 'company_admin';
  const roleLabel = user?.role ? t(`common.roles.${user.role}`, { defaultValue: user.role }) : '';

  const tabs = useMemo(() => {
    const items = [
      { id: 'profile' as const, label: t('settings.tabs.profile'), icon: User },
      { id: 'security' as const, label: t('settings.tabs.security'), icon: Lock },
    ];

    if (isAdmin && company) {
      items.push(
        { id: 'company', label: t('settings.tabs.company'), icon: Building2 },
        { id: 'notifications', label: t('settings.tabs.notifications'), icon: Bell }
      );
    }

    return items;
  }, [company, isAdmin, t]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('profile');
    }
  }, [activeTab, tabs]);

  useEffect(() => {
    setFullName(user?.full_name || '');
    setPersonalPhone(user?.phone || '');
  }, [user]);

  useEffect(() => {
    setCompanyName(company?.company_name || '');
    setCompanyPhone(company?.phone || '');
    setCompanyEmail(company?.email || '');
    setCompanyAddress(company?.address || '');
    setCompanyCategory(company?.category || DEFAULT_COMPANY_CATEGORY);
    setCustomInstructions(company?.custom_instructions || '');
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
    mutationFn: () => updateProfile({
      full_name: fullName.trim(),
      phone: personalPhone.trim() || null,
    }),
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
        custom_instructions: customInstructionsTrimmed || null,
      } as Partial<Company>),
    onSuccess: () => {
      setCompanyMsg({ type: 'ok', text: t('settings.companySaved') });
    },
    onError: (err: Error) => {
      setCompanyMsg({ type: 'err', text: err.message });
    },
  });

  const logoUploadMutation = useMutation({
    mutationFn: (file: File) => uploadCompanyLogo(file),
    onSuccess: () => {
      setLogoMsg({ type: 'ok', text: t('settings.logoSaved') });
    },
    onError: (err: Error) => {
      setLogoMsg({ type: 'err', text: err.message });
    },
  });

  const logoRemoveMutation = useMutation({
    mutationFn: () => removeCompanyLogo(),
    onSuccess: () => {
      setLogoMsg({ type: 'ok', text: t('settings.logoRemoved') });
    },
    onError: (err: Error) => {
      setLogoMsg({ type: 'err', text: err.message });
    },
  });

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setLogoMsg(null);
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setLogoMsg({ type: 'err', text: t('settings.logoInvalidType') });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoMsg({ type: 'err', text: t('settings.logoTooLarge') });
      return;
    }
    logoUploadMutation.mutate(file);
  };

  const { data: notificationData, isLoading: notificationsLoading } = useQuery({
    queryKey: ['notification-recipients'],
    queryFn: () => api.get<NotificationUser[]>('/notifications/recipients'),
    enabled: isAdmin,
  });

  useEffect(() => {
    if (notificationData) {
      setNotificationUsers(notificationData);
    }
  }, [notificationData]);

  const notificationsMutation = useMutation({
    mutationFn: () =>
      api.put<NotificationUser[]>('/notifications/recipients', {
        users: notificationUsers.map((u) => ({
          profile_id: u.id,
          phone: u.phone,
          notify_enabled: u.notify_enabled,
        })),
      }),
    onSuccess: (data) => {
      setNotificationUsers(data);
      setNotificationMsg({ type: 'ok', text: t('settings.notificationsSaved') });
    },
    onError: (err: Error) => {
      setNotificationMsg({ type: 'err', text: err.message });
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
        description={isAdmin ? t('settings.descriptionAdmin') : t('settings.description')}
      />

      <SettingsTabNav tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'profile' && (
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {!isAdmin && (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200/60">
              {t('settings.staffCompanyHint')}
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                {t('settings.personalInfo')}
              </CardTitle>
              <CardDescription>{t('settings.personalDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="personalPhone">{t('settings.personalPhone')}</Label>
                  <Input
                    id="personalPhone"
                    value={personalPhone}
                    onChange={(e) => setPersonalPhone(e.target.value)}
                    type="tel"
                    placeholder="905551234567"
                    autoComplete="tel"
                  />
                  <p className="text-xs text-slate-500">{t('settings.personalPhoneHint')}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                <span className="text-sm text-slate-500">{t('settings.roleLabel')}</span>
                <Badge variant="info" className="capitalize">{roleLabel}</Badge>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-h-[1.25rem]">
                  {profileMsg && <SettingsFeedback type={profileMsg.type} text={profileMsg.text} />}
                </div>
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
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="mx-auto w-full max-w-xl">
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
                    className="flex min-h-[44px] items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
                    onClick={() => setShowPasswords((v) => !v)}
                  >
                    {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showPasswords ? t('settings.hidePasswords') : t('settings.showPasswords')}
                  </button>

                  <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-h-[1.25rem]">
                      {passwordMsg && <SettingsFeedback type={passwordMsg.type} text={passwordMsg.text} />}
                    </div>
                    <Button type="submit" disabled={passwordMutation.isPending} className="w-full sm:w-auto">
                      {passwordMutation.isPending ? t('settings.updating') : t('settings.updatePassword')}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'company' && isAdmin && company && (
        <div className="mx-auto w-full max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                {t('settings.companyInfo')}
              </CardTitle>
              <CardDescription>{t('settings.companyDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{t('settings.sections.branding')}</h3>
                  <p className="mt-1 text-sm text-slate-500">{t('settings.companyLogoDesc')}</p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <CompanyLogo
                      logo={company.logo}
                      companyName={companyName}
                      size="md"
                      showFallbackIcon={false}
                      className="!bg-white !shadow-sm ring-1 ring-slate-200"
                      imageClassName="bg-white"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <p className="text-xs text-slate-500">{t('settings.companyLogoHint')}</p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="sr-only"
                          onChange={handleLogoSelect}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11"
                          disabled={logoUploadMutation.isPending || logoRemoveMutation.isPending}
                          onClick={() => logoInputRef.current?.click()}
                        >
                          <ImagePlus className="h-4 w-4" />
                          {logoUploadMutation.isPending ? t('common.saving') : t('settings.uploadLogo')}
                        </Button>
                        {company.logo && (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 text-red-600 hover:bg-red-50 hover:text-red-700"
                            disabled={logoUploadMutation.isPending || logoRemoveMutation.isPending}
                            onClick={() => {
                              setLogoMsg(null);
                              logoRemoveMutation.mutate();
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            {logoRemoveMutation.isPending ? t('common.saving') : t('settings.removeLogo')}
                          </Button>
                        )}
                      </div>
                      {logoMsg && <SettingsFeedback type={logoMsg.type} text={logoMsg.text} />}
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-4 border-t border-slate-100 pt-8">
                <h3 className="text-sm font-semibold text-slate-900">{t('settings.sections.general')}</h3>
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
                  <CompanyCategorySelect
                    id="companyCategory"
                    value={companyCategory}
                    onChange={setCompanyCategory}
                    className="rounded-xl border-slate-200 px-3.5 shadow-sm focus:border-primary/40 focus:ring-primary/25"
                  />
                </div>
              </section>

              <section className="space-y-4 border-t border-slate-100 pt-8">
                <h3 className="text-sm font-semibold text-slate-900">{t('settings.sections.contact')}</h3>
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
              </section>

              <section className="space-y-4 border-t border-slate-100 pt-8">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{t('settings.sections.aiAssistant')}</h3>
                  <p className="mt-1 text-sm text-slate-500">{t('settings.customInstructionsHint')}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customInstructions">{t('settings.customInstructions')}</Label>
                  <Textarea
                    id="customInstructions"
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    rows={5}
                    placeholder={t('settings.customInstructionsPlaceholder')}
                    className="min-h-[120px] resize-y"
                  />
                  <p
                    className={`text-right text-xs tabular-nums ${
                      customInstructionsOverLimit ? 'text-red-600' : 'text-slate-500'
                    }`}
                  >
                    {customInstructionsTrimmed.length}/{CUSTOM_INSTRUCTIONS_MAX_LENGTH}
                  </p>
                </div>
              </section>

              <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-h-[1.25rem]">
                  {companyMsg && <SettingsFeedback type={companyMsg.type} text={companyMsg.text} />}
                </div>
                <Button
                  onClick={() => {
                    setCompanyMsg(null);
                    companyMutation.mutate();
                  }}
                  disabled={companyMutation.isPending || !companyName.trim() || customInstructionsOverLimit}
                  className="w-full sm:w-auto"
                >
                  <Save className="h-4 w-4" />
                  {companyMutation.isPending ? t('common.saving') : t('settings.saveCompany')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'notifications' && isAdmin && company && (
        <div className="mx-auto w-full max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                {t('settings.notifications')}
              </CardTitle>
              <CardDescription>{t('settings.notificationsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200/60">
                {t('settings.notificationsHint')}
              </p>

              {notificationsLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner className="h-8 w-8" />
                </div>
              ) : notificationUsers.length === 0 ? (
                <p className="text-sm text-slate-500">{t('settings.noUsersForNotifications')}</p>
              ) : (
                <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {notificationUsers.map((member) => {
                    const roleText = t(`common.roles.${member.role}`, { defaultValue: member.role });
                    const missingPhone = member.notify_enabled && !member.phone?.trim();

                    return (
                      <div key={member.id} className="p-4 sm:p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <label className="flex min-h-[44px] min-w-0 flex-1 cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              checked={member.notify_enabled}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setNotificationUsers((prev) =>
                                  prev.map((u) =>
                                    u.id === member.id ? { ...u, notify_enabled: checked } : u
                                  )
                                );
                              }}
                              className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-primary focus:ring-primary/30"
                            />
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900">{member.full_name}</p>
                              <p className="truncate text-sm text-slate-500">{member.email || '—'}</p>
                              <Badge variant="info" className="mt-1.5 capitalize">{roleText}</Badge>
                            </div>
                          </label>

                          <div className="w-full space-y-1 lg:max-w-xs lg:shrink-0">
                            <Label htmlFor={`notify-phone-${member.id}`} className="text-xs">
                              {t('settings.phone')}
                            </Label>
                            <Input
                              id={`notify-phone-${member.id}`}
                              value={member.phone || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setNotificationUsers((prev) =>
                                  prev.map((u) =>
                                    u.id === member.id ? { ...u, phone: value } : u
                                  )
                                );
                              }}
                              type="tel"
                              placeholder="905551234567"
                              className="h-11"
                            />
                            {missingPhone && (
                              <p className="text-xs text-amber-600">{t('settings.noPhoneWarning')}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-h-[1.25rem]">
                  {notificationMsg && (
                    <SettingsFeedback type={notificationMsg.type} text={notificationMsg.text} />
                  )}
                </div>
                <Button
                  onClick={() => {
                    setNotificationMsg(null);
                    notificationsMutation.mutate();
                  }}
                  disabled={notificationsMutation.isPending || notificationsLoading || notificationUsers.length === 0}
                  className="w-full sm:w-auto"
                >
                  <Save className="h-4 w-4" />
                  {notificationsMutation.isPending ? t('common.saving') : t('settings.saveNotifications')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
