/**
 * Application-wide TypeScript type definitions
 * Shared types for database entities and API responses
 */

export type UserRole = 'super_admin' | 'company_admin' | 'staff';
export type CompanyCategory =
  | 'universite' | 'klinik' | 'dis_hekimi' | 'guzellik_merkezi'
  | 'emlak' | 'rent_a_car' | 'otel' | 'restoran' | 'kurs' | 'diger';
export type CompanyStatus = 'active' | 'inactive' | 'suspended' | 'trial';
export type SubscriptionPlanType = 'starter' | 'business' | 'enterprise';
export type WhatsAppStatus = 'connected' | 'disconnected' | 'pending' | 'error';
export type MessageSenderType = 'customer' | 'ai' | 'staff';
export type MessageStatus = 'open' | 'closed' | 'transferred';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type AppointmentSource = 'ai' | 'manual' | 'panel';

export interface Profile {
  id: string;
  user_id: string;
  company_id: string | null;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  company_name: string;
  category: CompanyCategory;
  phone: string | null;
  email: string | null;
  address: string | null;
  working_hours: Record<string, unknown>;
  logo: string | null;
  subscription_plan: SubscriptionPlanType;
  status: CompanyStatus;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppConfig {
  id: string;
  company_id: string;
  phone_number: string | null;
  business_account_id: string | null;
  access_token: string | null;
  webhook_verify_token: string | null;
  status: WhatsAppStatus;
  created_at: string;
  updated_at: string;
}

export type KnowledgeIndexStatus = 'pending' | 'indexing' | 'ready' | 'failed';

export interface KnowledgeItem {
  id: string;
  company_id: string;
  title: string;
  content: string;
  category: string | null;
  tags?: string[];
  is_active: boolean;
  index_status?: KnowledgeIndexStatus;
  chunk_count?: number;
  index_error?: string | null;
  source_filename?: string | null;
  char_count?: number | null;
  created_at: string;
  updated_at: string;
}

export interface RetrievedKnowledgeChunk {
  id: string;
  document_id: string;
  knowledge_base_id: string;
  chunk_index: number;
  heading: string | null;
  content: string;
  similarity: number;
  text_rank: number;
  combined_score: number;
}

export interface Message {
  id: string;
  company_id: string;
  customer_phone: string;
  customer_name: string | null;
  message: string;
  sender_type: MessageSenderType;
  status: MessageStatus;
  ticket_id: string | null;
  staff_id: string | null;
  whatsapp_message_id: string | null;
  created_at: string;
}

export interface Ticket {
  id: string;
  company_id: string;
  customer_phone: string;
  customer_name: string | null;
  subject: string;
  priority: TicketPriority;
  assigned_staff: string | null;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

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
  company_id: string;
  profile_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  company_id: string;
  plan_id: string;
  messages_used: number;
  messages_limit: number;
  users_limit: number;
  status: string;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
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

export interface AuthenticatedRequest {
  userId: string;
  profile: Profile;
  companyId: string | null;
  role: UserRole;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Conversation {
  customer_phone: string;
  customer_name: string | null;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  status: MessageStatus;
}
