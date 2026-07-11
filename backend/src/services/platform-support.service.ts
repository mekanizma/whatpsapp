/**
 * Platform support tickets — müşteri şirketler → platform yöneticisi
 */

import { adminClient } from '../database/supabase';
import {
  notifyAdminsNewPlatformSupportTicket,
} from './admin-email-notification.service';

export type PlatformSupportCategory =
  | 'general'
  | 'billing'
  | 'technical'
  | 'whatsapp'
  | 'account';

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
  company_name?: string;
  messages?: PlatformSupportMessage[];
  message_count?: number;
}

const OPEN_STATUSES = ['open', 'in_progress'];

async function attachMessages(tickets: PlatformSupportTicket[]): Promise<PlatformSupportTicket[]> {
  if (!tickets.length) return tickets;

  const ids = tickets.map((t) => t.id);
  const { data: messages, error } = await adminClient
    .from('platform_support_messages')
    .select('id, ticket_id, sender_type, sender_profile_id, sender_name, message, created_at')
    .in('ticket_id', ids)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  const byTicket = new Map<string, PlatformSupportMessage[]>();
  for (const msg of messages || []) {
    const list = byTicket.get(msg.ticket_id) || [];
    list.push(msg as PlatformSupportMessage);
    byTicket.set(msg.ticket_id, list);
  }

  return tickets.map((t) => ({
    ...t,
    messages: byTicket.get(t.id) || [],
    message_count: (byTicket.get(t.id) || []).length,
  }));
}

export async function listPlatformSupportTicketsAdmin(options?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{
  tickets: PlatformSupportTicket[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const page = options?.page || 1;
  const limit = options?.limit || 30;
  const offset = (page - 1) * limit;
  const search = options?.search?.trim().toLowerCase() || '';

  let query = adminClient
    .from('platform_support_tickets')
    .select(
      'id, company_id, subject, category, priority, status, created_by_profile_id, created_by_name, created_by_email, created_at, updated_at, closed_at, companies(company_name)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  if (options?.status && options.status !== 'all') {
    if (options.status === 'open') {
      query = query.in('status', OPEN_STATUSES);
    } else {
      query = query.eq('status', options.status);
    }
  }

  const { data, count, error } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  let tickets: PlatformSupportTicket[] = (data || []).map((row) => {
    const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
    const { companies: _c, ...rest } = row as Record<string, unknown>;
    return {
      ...(rest as unknown as PlatformSupportTicket),
      company_name: (company as { company_name?: string } | null)?.company_name,
    };
  });

  if (search) {
    tickets = tickets.filter(
      (t) =>
        t.subject.toLowerCase().includes(search) ||
        t.company_name?.toLowerCase().includes(search) ||
        t.created_by_name.toLowerCase().includes(search)
    );
  }

  const withMessages = await attachMessages(tickets);

  return {
    tickets: withMessages,
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
  };
}

export async function getPlatformSupportTicketAdmin(ticketId: string): Promise<PlatformSupportTicket> {
  const { data, error } = await adminClient
    .from('platform_support_tickets')
    .select(
      'id, company_id, subject, category, priority, status, created_by_profile_id, created_by_name, created_by_email, created_at, updated_at, closed_at, companies(company_name)'
    )
    .eq('id', ticketId)
    .single();

  if (error || !data) throw new Error('Destek talebi bulunamadı');

  const company = Array.isArray(data.companies) ? data.companies[0] : data.companies;
  const { companies: _c, ...rest } = data as Record<string, unknown>;
  const ticket: PlatformSupportTicket = {
    ...(rest as unknown as PlatformSupportTicket),
    company_name: (company as { company_name?: string } | null)?.company_name,
  };

  const [withMessages] = await attachMessages([ticket]);
  return withMessages;
}

export async function updatePlatformSupportTicketAdmin(
  ticketId: string,
  updates: { status?: string; priority?: string }
): Promise<PlatformSupportTicket> {
  const patch: Record<string, unknown> = {};
  if (updates.status) {
    patch.status = updates.status;
    if (updates.status === 'resolved' || updates.status === 'closed') {
      patch.closed_at = new Date().toISOString();
    } else {
      patch.closed_at = null;
    }
  }
  if (updates.priority) patch.priority = updates.priority;

  const { data, error } = await adminClient
    .from('platform_support_tickets')
    .update(patch)
    .eq('id', ticketId)
    .select(
      'id, company_id, subject, category, priority, status, created_by_profile_id, created_by_name, created_by_email, created_at, updated_at, closed_at, companies(company_name)'
    )
    .single();

  if (error || !data) throw new Error(error.message);

  const company = Array.isArray(data.companies) ? data.companies[0] : data.companies;
  const { companies: _c, ...rest } = data as Record<string, unknown>;
  const [ticket] = await attachMessages([
    {
      ...(rest as unknown as PlatformSupportTicket),
      company_name: (company as { company_name?: string } | null)?.company_name,
    },
  ]);
  return ticket;
}

export async function addPlatformSupportAdminMessage(
  ticketId: string,
  message: string,
  author: { profileId?: string | null; name?: string }
): Promise<PlatformSupportTicket> {
  const trimmed = message.trim();
  if (!trimmed) throw new Error('Mesaj boş olamaz');

  const ticket = await getPlatformSupportTicketAdmin(ticketId);
  if (ticket.status === 'closed') throw new Error('Kapatılmış talebe yanıt verilemez');

  const { error: msgError } = await adminClient.from('platform_support_messages').insert({
    ticket_id: ticketId,
    sender_type: 'admin',
    sender_profile_id: author.profileId || null,
    sender_name: author.name?.trim() || 'Platform Admin',
    message: trimmed,
  });

  if (msgError) throw new Error(msgError.message);

  if (ticket.status === 'open') {
    await adminClient
      .from('platform_support_tickets')
      .update({ status: 'in_progress' })
      .eq('id', ticketId);
  }

  return getPlatformSupportTicketAdmin(ticketId);
}

export async function listPlatformSupportTicketsForCompany(
  companyId: string
): Promise<PlatformSupportTicket[]> {
  const { data, error } = await adminClient
    .from('platform_support_tickets')
    .select(
      'id, company_id, subject, category, priority, status, created_by_profile_id, created_by_name, created_by_email, created_at, updated_at, closed_at'
    )
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return attachMessages((data || []) as PlatformSupportTicket[]);
}

export async function getPlatformSupportTicketForCompany(
  companyId: string,
  ticketId: string
): Promise<PlatformSupportTicket> {
  const { data, error } = await adminClient
    .from('platform_support_tickets')
    .select(
      'id, company_id, subject, category, priority, status, created_by_profile_id, created_by_name, created_by_email, created_at, updated_at, closed_at'
    )
    .eq('id', ticketId)
    .eq('company_id', companyId)
    .single();

  if (error || !data) throw new Error('Destek talebi bulunamadı');

  const [ticket] = await attachMessages([data as PlatformSupportTicket]);
  return ticket;
}

export async function createPlatformSupportTicket(
  companyId: string,
  input: {
    subject: string;
    message: string;
    category?: string;
    priority?: string;
  },
  author: { profileId?: string | null; name?: string; email?: string | null }
): Promise<PlatformSupportTicket> {
  const subject = input.subject.trim();
  const message = input.message.trim();
  if (!subject) throw new Error('Konu gerekli');
  if (!message) throw new Error('Mesaj gerekli');

  const { data: ticket, error } = await adminClient
    .from('platform_support_tickets')
    .insert({
      company_id: companyId,
      subject,
      category: input.category || 'general',
      priority: input.priority || 'medium',
      status: 'open',
      created_by_profile_id: author.profileId || null,
      created_by_name: author.name?.trim() || 'Kullanıcı',
      created_by_email: author.email || null,
    })
    .select(
      'id, company_id, subject, category, priority, status, created_by_profile_id, created_by_name, created_by_email, created_at, updated_at, closed_at'
    )
    .single();

  if (error || !ticket) throw new Error(error?.message || 'Talep oluşturulamadı');

  const { error: msgError } = await adminClient.from('platform_support_messages').insert({
    ticket_id: ticket.id,
    sender_type: 'customer',
    sender_profile_id: author.profileId || null,
    sender_name: author.name?.trim() || 'Kullanıcı',
    message,
  });

  if (msgError) throw new Error(msgError.message);

  const createdTicket = await getPlatformSupportTicketForCompany(companyId, ticket.id);

  void notifyAdminsNewPlatformSupportTicket(createdTicket).catch((err) => {
    console.error('[PlatformSupport] Admin e-posta bildirimi hatası:', err);
  });

  return createdTicket;
}

export async function addPlatformSupportCustomerMessage(
  companyId: string,
  ticketId: string,
  message: string,
  author: { profileId?: string | null; name?: string }
): Promise<PlatformSupportTicket> {
  const trimmed = message.trim();
  if (!trimmed) throw new Error('Mesaj boş olamaz');

  const ticket = await getPlatformSupportTicketForCompany(companyId, ticketId);
  if (ticket.status === 'closed' || ticket.status === 'resolved') {
    throw new Error('Kapatılmış talebe mesaj eklenemez');
  }

  const { error } = await adminClient.from('platform_support_messages').insert({
    ticket_id: ticketId,
    sender_type: 'customer',
    sender_profile_id: author.profileId || null,
    sender_name: author.name?.trim() || 'Kullanıcı',
    message: trimmed,
  });

  if (error) throw new Error(error.message);

  if (ticket.status === 'in_progress') {
    await adminClient.from('platform_support_tickets').update({ status: 'open' }).eq('id', ticketId);
  }

  const updatedTicket = await getPlatformSupportTicketForCompany(companyId, ticketId);

  return updatedTicket;
}

export async function countOpenPlatformSupportTickets(): Promise<number> {
  const { count, error } = await adminClient
    .from('platform_support_tickets')
    .select('id', { count: 'exact', head: true })
    .in('status', OPEN_STATUSES);

  if (error) return 0;
  return count || 0;
}
