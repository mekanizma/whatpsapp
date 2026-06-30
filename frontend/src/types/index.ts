/**
 * Frontend TypeScript type definitions
 */

export type UserRole = 'super_admin' | 'company_admin' | 'staff';

export interface Profile {
  id: string;
  user_id: string;
  company_id: string | null;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  is_active: boolean;
}

export interface Company {
  id: string;
  company_name: string;
  category: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo: string | null;
  subscription_plan: string;
  status: string;
  created_at?: string;
}

export interface AdminCompany extends Company {
  message_count?: number;
  ai_tokens_month?: number;
  subscription?: {
    messages_used: number;
    messages_limit: number;
    status: string;
    users_limit?: number;
  };
  whatsapp?: {
    status: string;
    phone_number: string | null;
  };
}

export interface PlatformStats {
  total_companies: number;
  total_messages: number;
  total_messages_used: number;
  active_subscriptions: number;
  open_tickets: number;
  whatsapp_connected: number;
  ai_tokens_month: number;
  ai_api_calls_month: number;
  ai_saved_month: number;
  ai_model: string;
}

export interface CompanyDetail {
  company: Company;
  subscription: {
    messages_used: number;
    messages_limit: number;
    status: string;
    users_limit: number;
    plan?: { plan_type: string; name: string };
  } | null;
  whatsapp: { status: string; phone_number: string | null } | null;
  users: { id: string; full_name: string; role: string; is_active: boolean; created_at: string }[];
  staff_count: number;
  stats: DashboardStats;
}

export interface AIUsageRow {
  company_id: string;
  company_name: string;
  tokens: number;
  api_calls: number;
  saved: number;
}

export interface ActivityLog {
  id: string;
  company_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface PlatformSettings {
  demo_mode: boolean;
  ai_model: string;
  ai_max_tokens: number;
  ai_cache_enabled: boolean;
  node_env: string;
  supabase_connected: boolean;
  whatsapp_mode: 'cloud_api' | 'baileys';
}

export interface DashboardStats {
  total_messages: number;
  today_messages: number;
  ai_responses: number;
  transferred: number;
  active_customers: number;
  messages_used: number;
  messages_limit: number;
  ai_api_calls: number;
  ai_cached_hits: number;
  ai_skipped: number;
  ai_tokens_used: number;
}

export interface Conversation {
  customer_phone: string;
  customer_name: string | null;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  status: string;
}

export interface Message {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  message: string;
  sender_type: 'customer' | 'ai' | 'staff';
  status: string;
  created_at: string;
}

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  category: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ParsedKnowledgeFile {
  title: string;
  content: string;
  source_filename: string;
  file_type: string;
  truncated: boolean;
  char_count: number;
}

export interface Ticket {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  subject: string;
  priority: string;
  status: string;
  assigned_staff: string | null;
  staff?: { name: string; email: string };
  created_at: string;
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type AppointmentSource = 'ai' | 'manual' | 'panel';

export interface Appointment {
  id: string;
  company_id: string;
  customer_phone: string;
  customer_name: string | null;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  created_at: string;
  updated_at: string;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
}

export interface WhatsAppConfig {
  id: string;
  phone_number: string | null;
  business_account_id: string | null;
  status: string;
}

export interface SubscriptionUsage {
  messages_used: number;
  messages_limit: number;
  users_used: number;
  users_limit: number;
  status: string;
  messages_percentage: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
