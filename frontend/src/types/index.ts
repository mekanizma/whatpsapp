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
  phone: string | null;
  is_active: boolean;
}

export interface Company {
  id: string;
  company_name: string;
  category: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  custom_instructions?: string | null;
  logo: string | null;
  subscription_plan: string;
  status: string;
  created_at?: string;
}

export interface CompanyPlan {
  plan_type: string;
  name: string;
  description: string | null;
  features: string[];
  message_limit: number;
  user_limit: number;
  messages_limit: number;
  messages_used: number;
  users_limit: number;
  status: string;
}

export interface AdminCompany extends Company {
  conversation_count?: number;
  ai_tokens_month?: number;
  plan?: CompanyPlan | null;
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
  total_conversations: number;
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
  plan?: CompanyPlan | null;
  subscription: {
    messages_used: number;
    messages_limit: number;
    status: string;
    users_limit: number;
    plan?: {
      plan_type: string;
      name: string;
      description?: string | null;
      features?: string[];
      message_limit?: number;
      user_limit?: number;
    };
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

export interface InvoiceIssuerSettings {
  name: string;
  legalName: string;
  address: string;
  taxOffice: string;
  taxNumber: string;
  email: string;
  phone: string;
  website: string;
  vatRate: number;
  footerNote: string | null;
}

export interface AIPromptTemplate {
  id: string;
  prompt_key: string;
  prompt_role: 'greeting' | 'system' | 'appointment' | 'language' | 'translation' | 'custom';
  name: string;
  description: string | null;
  category: string;
  content: string;
  variables: string[];
  is_active: boolean;
  sort_order: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export type PromptRole = AIPromptTemplate['prompt_role'];

export interface DashboardStats {
  total_conversations: number;
  today_conversations: number;
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
  department_id?: string | null;
  department?: { id: string; name: string } | null;
  is_active: boolean;
  index_status?: 'pending' | 'indexing' | 'ready' | 'failed';
  chunk_count?: number;
  index_error?: string | null;
  source_filename?: string | null;
  char_count?: number | null;
  created_at: string;
}

export interface ParsedKnowledgeFile {
  title: string;
  content: string;
  source_filename: string;
  file_type: string;
  truncated: boolean;
  char_count: number;
  chunk_estimate: number;
}

export interface KnowledgeChunkPreview {
  chunk_count: number;
  previews: { index: number; heading: string | null; preview: string }[];
}

export interface UnknownQuestion {
  id: string;
  company_id: string;
  customer_phone: string;
  customer_name: string | null;
  question: string;
  ai_response: string | null;
  status: 'open' | 'resolved' | 'dismissed' | 'added_to_kb';
  occurrence_count: number;
  last_asked_at: string;
  created_at: string;
  updated_at: string;
}

export interface Ticket {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  subject: string;
  priority: string;
  status: string;
  assigned_staff: string | null;
  department_id?: string | null;
  department?: { id: string; name: string } | null;
  staff?: { name: string; email: string };
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
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
  preferred_doctor: string | null;
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
  phone: string | null;
  role: string;
  department_id?: string | null;
  department?: { id: string; name: string } | null;
  is_active: boolean;
}

export interface NotificationUser {
  id: string;
  full_name: string;
  role: string;
  email: string | null;
  phone: string | null;
  notify_enabled: boolean;
}

export interface WhatsAppConfig {
  id: string;
  phone_number: string | null;
  business_account_id: string | null;
  status: string;
}

export interface SubscriptionPlan {
  id: string;
  plan_type: string;
  name: string;
  description: string | null;
  features?: string[];
  message_limit: number;
  user_limit: number;
  price_monthly: number;
  price_yearly?: number | null;
  currency?: string;
  is_active: boolean;
  created_at?: string;
}

export interface SubscriptionUsage {
  messages_used: number;
  messages_limit: number;
  users_used: number;
  users_limit: number;
  status: string;
  messages_percentage: number;
  quota_exhausted?: boolean;
  plan_type?: string | null;
}

export interface AiConversationAddon {
  id: string;
  name: string;
  conversation_count: number;
  price: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface CurrentSubscription {
  messages_used: number;
  messages_limit: number;
  users_limit: number;
  status: string;
  plan: SubscriptionPlan | null;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
