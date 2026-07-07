/**
 * Frontend TypeScript type definitions
 */

export type UserRole = 'super_admin' | 'company_admin' | 'staff';
export type StaffSubRole = 'agent' | 'supervisor' | 'admin';

export interface Profile {
  id: string;
  user_id: string;
  company_id: string | null;
  full_name: string;
  role: UserRole;
  staff_role?: StaffSubRole | null;
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
  platform_support_open: number;
  whatsapp_connected: number;
  ai_tokens_month: number;
  ai_api_calls_month: number;
  ai_saved_month: number;
  ai_model: string;
}

export type ActionCenterCategory = 'quota' | 'whatsapp' | 'trial' | 'activity' | 'tickets';
export type ActionCenterSeverity = 'critical' | 'warning' | 'info';
export type ActionCenterItemType =
  | 'quota_exhausted'
  | 'quota_high'
  | 'whatsapp_disconnected'
  | 'trial_expired'
  | 'trial_ending'
  | 'inactive_messaging'
  | 'open_ticket';

export interface ActionCenterItem {
  id: string;
  type: ActionCenterItemType;
  category: ActionCenterCategory;
  severity: ActionCenterSeverity;
  company_id: string;
  company_name: string;
  meta: {
    quota_percent?: number;
    messages_used?: number;
    messages_limit?: number;
    days_left?: number;
    trial_end?: string;
    ticket_id?: string;
    ticket_subject?: string;
    ticket_priority?: string;
    hours_inactive?: number;
  };
}

export interface ActionCenterData {
  total: number;
  critical_count: number;
  warning_count: number;
  items: ActionCenterItem[];
}

export type WhatsAppHealthStatus =
  | 'connected'
  | 'disconnected'
  | 'qr_pending'
  | 'reconnecting'
  | 'error'
  | 'not_configured';

export type WhatsAppConnectionType = 'qr' | 'api' | 'none';

export interface WhatsAppHealthAccount {
  account_id: string;
  company_id: string;
  company_name: string;
  company_status: string;
  label: string | null;
  phone_number: string | null;
  db_status: string;
  health_status: WhatsAppHealthStatus;
  connection_type: WhatsAppConnectionType;
  is_default: boolean;
  is_active: boolean;
  last_synced_at: string | null;
  last_message_at: string | null;
  updated_at: string | null;
  live_connected: boolean | null;
}

export interface WhatsAppHealthSummary {
  total_accounts: number;
  connected: number;
  disconnected: number;
  qr_pending: number;
  reconnecting: number;
  error: number;
  issues: number;
}

export interface WhatsAppHealthData {
  summary: WhatsAppHealthSummary;
  accounts: WhatsAppHealthAccount[];
  checked_at: string;
}

export interface CompanyAdminNote {
  id: string;
  company_id: string;
  content: string;
  author_profile_id: string | null;
  author_name: string;
  created_at: string;
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
  users: { id: string; full_name: string; role: string; is_active: boolean; created_at: string; email?: string | null }[];
  staff_count: number;
  stats: DashboardStats;
}

export interface PlatformUser {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  company_id: string | null;
  company_name: string | null;
  email: string | null;
}

export interface SuperAdminUser {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ImpersonationState {
  active: boolean;
  company_id: string | null;
  company_name: string | null;
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
  staff_id?: string | null;
  sender_name?: string | null;
  sender_display_name?: string | null;
  staff?: { name: string } | null;
  media_url?: string | null;
  media_type?: string | null;
  media_filename?: string | null;
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
  staff?: { name: string; email?: string } | null;
  created_at: string;
}

export interface PlatformSupportMessage {
  id: string;
  ticket_id: string;
  sender_type: 'customer' | 'admin';
  sender_profile_id: string | null;
  sender_name: string;
  message: string;
  created_at: string;
}

export interface PlatformSupportTicket {
  id: string;
  company_id: string;
  company_name?: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  created_by_profile_id: string | null;
  created_by_name: string;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  messages?: PlatformSupportMessage[];
  message_count?: number;
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
  role: StaffSubRole;
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

export interface ReferenceLogo {
  id: string;
  name: string;
  logo_url: string;
  website?: string | null;
  display_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
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
