/**
 * Global auth state management with Zustand
 */

import { create } from 'zustand';
import { supabase, supabaseConfigured } from '@/services/supabase';
import { isDemoMode } from '@/lib/env';
import { api, setDemoToken, clearDemoToken, setImpersonateToken, clearImpersonateToken, clearImpersonateCompanyId } from '@/services/api';
import i18n from '@/i18n';
import type { Profile, Company, UserRole, CompanyPlan, ImpersonationState } from '@/types';
export type LoginPanel = 'admin' | 'customer';

export interface RegisterData {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  companyName?: string;
  category?: string;
}

const DEMO_USERS: Record<string, { password: string; token: string; role: UserRole }> = {
  'admin@demo.com': { password: 'demo123', token: 'demo-admin-token', role: 'super_admin' },
  'firma@demo.com': { password: 'demo123', token: 'demo-company-token', role: 'company_admin' },
  'personel@demo.com': { password: 'demo123', token: 'demo-staff-token', role: 'staff' },
};

function mapLoginError(error: { message?: string; code?: string }): string {
  const code = error.code?.toLowerCase() ?? '';
  const message = error.message?.toLowerCase() ?? '';
  if (
    code === 'invalid_credentials' ||
    message.includes('invalid login credentials') ||
    message.includes('invalid_credentials')
  ) {
    return i18n.t('auth.errors.invalidCredentials');
  }
  return error.message || i18n.t('errors.unknown');
}

interface AuthState {
  user: Profile | null;
  company: Company | null;
  companyPlan: CompanyPlan | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isImpersonating: boolean;
  impersonatedCompanyId: string | null;
  impersonatedCompanyName: string | null;
  login: (email: string, password: string, panel: LoginPanel) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  startImpersonation: (companyId: string) => Promise<void>;
  stopImpersonation: () => Promise<void>;
  updateProfile: (data: { full_name?: string; phone?: string | null }) => Promise<Profile>;
  updateCompany: (data: Partial<Company>) => Promise<Company>;
  uploadCompanyLogo: (file: File) => Promise<Company>;
  removeCompanyLogo: () => Promise<Company>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  initialize: () => Promise<void>;
}

type MeResponse = {
  profile: Profile;
  company: Company | null;
  companyPlan: CompanyPlan | null;
  impersonation?: ImpersonationState;
};

function applyMeResponse(
  set: (partial: Partial<AuthState> | ((state: AuthState) => Partial<AuthState>)) => void,
  data: MeResponse,
  options?: { preserveImpersonationOnInactive?: boolean }
) {
  const impersonation = data.impersonation;
  if (!impersonation?.active && !options?.preserveImpersonationOnInactive) {
    clearImpersonateToken();
    clearImpersonateCompanyId();
  }
  set({
    user: data.profile,
    company: data.company,
    companyPlan: data.companyPlan,
    isAuthenticated: true,
    isLoading: false,
    isImpersonating: !!impersonation?.active,
    impersonatedCompanyId: impersonation?.company_id ?? null,
    impersonatedCompanyName: impersonation?.company_name ?? null,
  });
}

export function getRedirectPath(role?: UserRole): string {
  if (role === 'super_admin') return '/admin';
  if (role === 'staff') return '/panel/messages';
  return '/panel/dashboard';
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  company: null,
  companyPlan: null,
  isLoading: true,
  isAuthenticated: false,
  isImpersonating: false,
  impersonatedCompanyId: null,
  impersonatedCompanyName: null,

  login: async (email, password, panel) => {
    if (isDemoMode) {
      const demoUser = DEMO_USERS[email.toLowerCase()];
      if (!demoUser || demoUser.password !== password) {
        throw new Error(i18n.t('auth.errors.demoInvalidCredentials'));
      }
      if (panel === 'admin' && demoUser.role !== 'super_admin') {
        throw new Error(i18n.t('auth.errors.adminPanelCustomerOnly'));
      }
      if (panel === 'customer' && demoUser.role === 'super_admin') {
        throw new Error(i18n.t('auth.errors.customerPanelAdminOnly'));
      }
      clearImpersonateToken();
      clearImpersonateCompanyId();
      setDemoToken(demoUser.token);
      const data = await api.get<MeResponse>('/auth/me');
      applyMeResponse(set, data);
      return;
    }

    if (!supabaseConfigured) {
      throw new Error(i18n.t('auth.errors.supabaseNotConfiguredHint'));
    }

    const normalizedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (error) throw new Error(mapLoginError(error));

    clearImpersonateToken();
    clearImpersonateCompanyId();
    const data = await api.get<MeResponse>('/auth/me');

    if (panel === 'admin' && data.profile.role !== 'super_admin') {
      await supabase.auth.signOut();
      throw new Error(i18n.t('auth.errors.adminPanelDenied'));
    }
    if (panel === 'customer' && data.profile.role === 'super_admin') {
      await supabase.auth.signOut();
      throw new Error(i18n.t('auth.errors.customerPanelDenied'));
    }

    applyMeResponse(set, data);
  },

  register: async ({ email, password, fullName, phone, companyName, category }) => {
    if (isDemoMode) throw new Error(i18n.t('auth.errors.demoRegisterDisabled'));
    if (!supabaseConfigured) throw new Error(i18n.t('auth.errors.supabaseNotConfigured'));

    const metadata: Record<string, string> = { full_name: fullName };
    if (phone?.trim()) metadata.phone = phone.trim();
    if (companyName?.trim()) metadata.company_name = companyName.trim();
    if (category?.trim()) metadata.category = category.trim();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
    if (error) throw new Error(error.message);
  },

  logout: async () => {
    clearImpersonateToken();
    clearImpersonateCompanyId();
    if (isDemoMode) {
      clearDemoToken();
    } else if (supabaseConfigured) {
      await supabase.auth.signOut();
    }
    set({
      user: null,
      company: null,
      companyPlan: null,
      isAuthenticated: false,
      isImpersonating: false,
      impersonatedCompanyId: null,
      impersonatedCompanyName: null,
    });
  },

  fetchProfile: async () => {
    try {
      const data = await api.get<MeResponse>('/auth/me');
      applyMeResponse(set, data);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('429') || message.includes('Çok fazla istek') || message.includes('Too many requests')) {
        set({ isLoading: false });
        return;
      }
      clearImpersonateToken();
      clearImpersonateCompanyId();
      set({
        user: null,
        company: null,
        companyPlan: null,
        isAuthenticated: false,
        isLoading: false,
        isImpersonating: false,
        impersonatedCompanyId: null,
        impersonatedCompanyName: null,
      });
    }
  },

  startImpersonation: async (companyId) => {
    const result = await api.post<{ company_id: string; company_name: string; token: string }>(
      `/admin/companies/${companyId}/impersonate`
    );
    if (!result?.token) {
      throw new Error(i18n.t('admin.impersonation.error'));
    }
    setImpersonateToken(result.token);
    set({
      isImpersonating: true,
      impersonatedCompanyId: result.company_id,
      impersonatedCompanyName: result.company_name,
    });
    const data = await api.get<MeResponse>('/auth/me');
    applyMeResponse(set, data, { preserveImpersonationOnInactive: true });
    if (!data.impersonation?.active) {
      clearImpersonateToken();
      clearImpersonateCompanyId();
      set({
        isImpersonating: false,
        impersonatedCompanyId: null,
        impersonatedCompanyName: null,
      });
      throw new Error(i18n.t('admin.impersonation.error'));
    }
  },

  stopImpersonation: async () => {
    clearImpersonateToken();
    clearImpersonateCompanyId();
    set({
      isImpersonating: false,
      impersonatedCompanyId: null,
      impersonatedCompanyName: null,
      company: null,
      companyPlan: null,
    });
    await get().fetchProfile();
  },

  updateProfile: async (data) => {
    const updated = await api.put<Profile>('/auth/profile', data);
    set((state) => ({
      user: state.user ? { ...state.user, ...updated } : updated,
    }));
    return updated;
  },

  updateCompany: async (data) => {
    const company = get().company;
    if (!company?.id) throw new Error(i18n.t('auth.errors.companyNotFound'));
    const updated = await api.put<Company>(`/companies/${company.id}`, data);
    set({ company: { ...company, ...updated } });
    return updated;
  },

  uploadCompanyLogo: async (file) => {
    const company = get().company;
    if (!company?.id) throw new Error(i18n.t('auth.errors.companyNotFound'));
    const updated = await api.upload<Company>(`/companies/${company.id}/logo`, file);
    set({ company: { ...company, ...updated } });
    return updated;
  },

  removeCompanyLogo: async () => {
    const company = get().company;
    if (!company?.id) throw new Error(i18n.t('auth.errors.companyNotFound'));
    const updated = await api.delete<Company>(`/companies/${company.id}/logo`);
    set({ company: { ...company, ...updated } });
    return updated;
  },

  changePassword: async (currentPassword, newPassword) => {
    if (isDemoMode) {
      throw new Error(i18n.t('auth.errors.demoPasswordChangeDisabled'));
    }
    if (!supabaseConfigured) {
      throw new Error(i18n.t('auth.errors.supabaseNotConfigured'));
    }

    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email;
    if (!email) throw new Error(i18n.t('auth.errors.sessionNotFound'));

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (signInError) throw new Error(i18n.t('auth.errors.wrongPassword'));

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) throw new Error(updateError.message);
  },

  initialize: async () => {
    if (isDemoMode) {
      const token = localStorage.getItem('wa_demo_token');
      if (token) {
        await get().fetchProfile();
      } else {
        set({ isLoading: false });
      }
      return;
    }

    if (!supabaseConfigured) {
      set({ isLoading: false });
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await get().fetchProfile();
      } else {
        set({ isLoading: false });
      }

      supabase.auth.onAuthStateChange((_event, session) => {
        if (!session) {
          set({ user: null, company: null, companyPlan: null, isAuthenticated: false, isLoading: false });
        }
      });
    } catch {
      set({ isLoading: false });
    }
  },
}));
