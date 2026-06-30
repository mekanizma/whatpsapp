/**
 * Global auth state management with Zustand
 */

import { create } from 'zustand';
import { supabase, supabaseConfigured } from '@/services/supabase';
import { isDemoMode } from '@/lib/env';
import { api, setDemoToken, clearDemoToken } from '@/services/api';
import type { Profile, Company, UserRole } from '@/types';

export type LoginPanel = 'admin' | 'customer';

const DEMO_USERS: Record<string, { password: string; token: string; role: UserRole }> = {
  'admin@demo.com': { password: 'demo123', token: 'demo-admin-token', role: 'super_admin' },
  'firma@demo.com': { password: 'demo123', token: 'demo-company-token', role: 'company_admin' },
  'personel@demo.com': { password: 'demo123', token: 'demo-staff-token', role: 'staff' },
};

interface AuthState {
  user: Profile | null;
  company: Company | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, panel: LoginPanel) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  updateProfile: (data: { full_name?: string }) => Promise<Profile>;
  updateCompany: (data: Partial<Company>) => Promise<Company>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  initialize: () => Promise<void>;
}

export function getRedirectPath(role?: UserRole): string {
  if (role === 'super_admin') return '/admin';
  return '/panel/dashboard';
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  company: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email, password, panel) => {
    if (isDemoMode) {
      const demoUser = DEMO_USERS[email.toLowerCase()];
      if (!demoUser || demoUser.password !== password) {
        throw new Error('Demo: admin@demo.com, firma@demo.com veya personel@demo.com / demo123');
      }
      if (panel === 'admin' && demoUser.role !== 'super_admin') {
        throw new Error('Bu hesap admin paneline erişemez. Müşteri girişini kullanın.');
      }
      if (panel === 'customer' && demoUser.role === 'super_admin') {
        throw new Error('Admin hesabı müşteri paneline giremez. Admin girişini kullanın.');
      }
      setDemoToken(demoUser.token);
      const data = await api.get<{ profile: Profile; company: Company | null }>('/auth/me');
      set({ user: data.profile, company: data.company, isAuthenticated: true });
      return;
    }

    if (!supabaseConfigured) {
      throw new Error('Supabase yapılandırılmamış. frontend/.env dosyasını düzenleyin veya VITE_DEMO_MODE=true kullanın.');
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    const data = await api.get<{ profile: Profile; company: Company | null }>('/auth/me');

    if (panel === 'admin' && data.profile.role !== 'super_admin') {
      await supabase.auth.signOut();
      throw new Error('Bu hesap admin paneline erişemez.');
    }
    if (panel === 'customer' && data.profile.role === 'super_admin') {
      await supabase.auth.signOut();
      throw new Error('Admin hesabı müşteri paneline giremez.');
    }

    set({ user: data.profile, company: data.company, isAuthenticated: true });
  },

  register: async (email, password, fullName) => {
    if (isDemoMode) throw new Error('Demo modda kayıt kapalı.');
    if (!supabaseConfigured) throw new Error('Supabase yapılandırılmamış.');

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw new Error(error.message);
  },

  logout: async () => {
    if (isDemoMode) {
      clearDemoToken();
    } else if (supabaseConfigured) {
      await supabase.auth.signOut();
    }
    set({ user: null, company: null, isAuthenticated: false });
  },

  fetchProfile: async () => {
    try {
      const data = await api.get<{ profile: Profile; company: Company | null }>('/auth/me');
      set({ user: data.profile, company: data.company, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, company: null, isAuthenticated: false, isLoading: false });
    }
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
    if (!company?.id) throw new Error('Şirket bilgisi bulunamadı');
    const updated = await api.put<Company>(`/companies/${company.id}`, data);
    set({ company: { ...company, ...updated } });
    return updated;
  },

  changePassword: async (currentPassword, newPassword) => {
    if (isDemoMode) {
      throw new Error('Demo modda şifre değiştirilemez.');
    }
    if (!supabaseConfigured) {
      throw new Error('Supabase yapılandırılmamış.');
    }

    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email;
    if (!email) throw new Error('Oturum bilgisi alınamadı. Lütfen tekrar giriş yapın.');

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (signInError) throw new Error('Mevcut şifre hatalı.');

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
          set({ user: null, company: null, isAuthenticated: false, isLoading: false });
        }
      });
    } catch {
      set({ isLoading: false });
    }
  },
}));
