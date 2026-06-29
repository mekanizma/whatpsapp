/**
 * Mock data for local demo mode (no Supabase required)
 */

import { Company, DashboardStats, Profile } from '../types';

export const DEMO_COMPANY_ID = '00000000-0000-0000-0000-000000000003';

export const DEMO_TOKENS = {
  admin: 'demo-admin-token',
  company: 'demo-company-token',
  staff: 'demo-staff-token',
} as const;

export const demoAdminProfile: Profile = {
  id: '00000000-0000-0000-0000-000000000010',
  user_id: '00000000-0000-0000-0000-000000000011',
  company_id: null,
  full_name: 'Platform Admin',
  role: 'super_admin',
  avatar_url: null,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const demoCompanyProfile: Profile = {
  id: '00000000-0000-0000-0000-000000000020',
  user_id: '00000000-0000-0000-0000-000000000021',
  company_id: DEMO_COMPANY_ID,
  full_name: 'Ahmet Yılmaz',
  role: 'company_admin',
  avatar_url: null,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const demoStaffProfile: Profile = {
  id: '00000000-0000-0000-0000-000000000030',
  user_id: '00000000-0000-0000-0000-000000000031',
  company_id: DEMO_COMPANY_ID,
  full_name: 'Ayşe Demir',
  role: 'staff',
  avatar_url: null,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const demoProfilesByToken: Record<string, Profile> = {
  [DEMO_TOKENS.admin]: demoAdminProfile,
  [DEMO_TOKENS.company]: demoCompanyProfile,
  [DEMO_TOKENS.staff]: demoStaffProfile,
};

/** @deprecated use demoProfilesByToken */
export const demoProfile = demoAdminProfile;
export const DEMO_TOKEN = DEMO_TOKENS.admin;

export const demoCompany: Company = {
  id: DEMO_COMPANY_ID,
  company_name: 'Demo Klinik',
  category: 'klinik',
  phone: '+905551234567',
  email: 'info@demoklinik.com',
  address: 'Lefkoşa, KKTC',
  working_hours: {},
  logo: null,
  subscription_plan: 'business',
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const demoDashboardStats: DashboardStats = {
  total_messages: 1247,
  today_messages: 38,
  ai_responses: 982,
  transferred: 45,
  active_customers: 156,
  messages_used: 1247,
  messages_limit: 5000,
  ai_api_calls: 312,
  ai_cached_hits: 89,
  ai_skipped: 581,
  ai_tokens_used: 78400,
};

export const demoPlatformStats = {
  total_companies: 12,
  total_messages: 8432,
  total_messages_used: 6210,
  active_subscriptions: 10,
};

export const demoSubscriptionUsage = {
  messages_used: 1247,
  messages_limit: 5000,
  users_used: 3,
  users_limit: 5,
  status: 'active',
  messages_percentage: 25,
};

export const demoPlans = [
  { id: '1', plan_type: 'starter', name: 'Starter', description: 'Küçük işletmeler', message_limit: 1000, user_limit: 1, price_monthly: 499 },
  { id: '2', plan_type: 'business', name: 'Business', description: 'Orta ölçekli', message_limit: 5000, user_limit: 5, price_monthly: 1499 },
  { id: '3', plan_type: 'enterprise', name: 'Enterprise', description: 'Sınırsız', message_limit: 999999, user_limit: 999, price_monthly: 4999 },
];

// Demo QR sessions (in-memory)
export const demoQrSessions = new Map<string, {
  id: string;
  company_id: string;
  session_token: string;
  qr_data_url: string;
  status: 'pending' | 'scanned' | 'connected' | 'expired' | 'failed';
  phone_number: string | null;
  display_name: string | null;
  expires_at: string;
  connected_at: string | null;
  created_at: string;
  scan_simulated_at?: number;
}>();

export const demoWhatsAppState = {
  connected: false,
  phone: '+905551234567',
};
