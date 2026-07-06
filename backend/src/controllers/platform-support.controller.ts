/**
 * Platform support tickets controller
 */

import { Response } from 'express';
import { demoCompany } from '../demo/mockData';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
import { logActivity } from '../services/log.service';
import {
  listPlatformSupportTicketsAdmin,
  getPlatformSupportTicketAdmin,
  updatePlatformSupportTicketAdmin,
  addPlatformSupportAdminMessage,
  listPlatformSupportTicketsForCompany,
  getPlatformSupportTicketForCompany,
  createPlatformSupportTicket,
  addPlatformSupportCustomerMessage,
} from '../services/platform-support.service';

const DEMO_TICKET_ID = 'demo-platform-support-1';

function demoTickets() {
  const now = new Date().toISOString();
  return [
    {
      id: DEMO_TICKET_ID,
      company_id: demoCompany.id,
      company_name: demoCompany.company_name,
      subject: 'WhatsApp bağlantısı sürekli kopuyor',
      category: 'whatsapp',
      priority: 'high',
      status: 'open',
      created_by_profile_id: null,
      created_by_name: 'Ahmet Yılmaz',
      created_by_email: 'info@demoklinik.com',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: now,
      closed_at: null,
      message_count: 1,
      messages: [
        {
          id: 'demo-msg-1',
          ticket_id: DEMO_TICKET_ID,
          sender_type: 'customer' as const,
          sender_profile_id: null,
          sender_name: 'Ahmet Yılmaz',
          message: 'QR ile bağlandıktan birkaç saat sonra bağlantı kopuyor. Yardımcı olur musunuz?',
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
      ],
    },
  ];
}

// ——— Admin ———

export async function adminListSupportTickets(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({
      success: true,
      data: demoTickets(),
      pagination: { page: 1, limit: 30, total: 1, totalPages: 1 },
    });
    return;
  }

  const page = parseInt(req.query.page as string) || 1;
  const status = (req.query.status as string) || 'all';
  const search = (req.query.search as string) || '';

  try {
    const result = await listPlatformSupportTicketsAdmin({ page, status, search });
    res.json({ success: true, data: result.tickets, pagination: result.pagination });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function adminGetSupportTicket(req: AuthRequest, res: Response): Promise<void> {
  const ticketId = req.params.id as string;

  if (isDemoSession(req)) {
    const found = demoTickets().find((t) => t.id === ticketId);
    if (!found) {
      res.status(404).json({ success: false, error: 'Bulunamadı' });
      return;
    }
    res.json({ success: true, data: found });
    return;
  }

  try {
    const data = await getPlatformSupportTicketAdmin(ticketId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(404).json({ success: false, error: err instanceof Error ? err.message : 'Bulunamadı' });
  }
}

export async function adminUpdateSupportTicket(req: AuthRequest, res: Response): Promise<void> {
  const ticketId = req.params.id as string;
  const { status, priority } = req.body;

  if (isDemoSession(req)) {
    res.status(400).json({ success: false, error: 'Demo modda güncellenemez' });
    return;
  }

  try {
    const data = await updatePlatformSupportTicketAdmin(ticketId, { status, priority });
    await logActivity({
      userId: req.userId,
      companyId: data.company_id,
      action: 'platform_support_ticket_updated',
      entityType: 'platform_support_ticket',
      entityId: ticketId,
      metadata: { status, priority },
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function adminReplySupportTicket(req: AuthRequest, res: Response): Promise<void> {
  const ticketId = req.params.id as string;
  const { message } = req.body;

  if (!message?.trim()) {
    res.status(400).json({ success: false, error: 'Mesaj gerekli' });
    return;
  }

  if (isDemoSession(req)) {
    res.status(400).json({ success: false, error: 'Demo modda yanıt verilemez' });
    return;
  }

  try {
    const data = await addPlatformSupportAdminMessage(ticketId, message, {
      profileId: req.profile?.id,
      name: req.profile?.full_name,
    });
    await logActivity({
      userId: req.userId,
      companyId: data.company_id,
      action: 'platform_support_ticket_replied',
      entityType: 'platform_support_ticket',
      entityId: ticketId,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

// ——— Customer (company admin) ———

export async function listMySupportTickets(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({ success: true, data: demoTickets() });
    return;
  }

  try {
    const data = await listPlatformSupportTicketsForCompany(req.companyId!);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function getMySupportTicket(req: AuthRequest, res: Response): Promise<void> {
  const ticketId = req.params.id as string;

  if (isDemoSession(req)) {
    const found = demoTickets().find((t) => t.id === ticketId);
    if (!found) {
      res.status(404).json({ success: false, error: 'Bulunamadı' });
      return;
    }
    res.json({ success: true, data: found });
    return;
  }

  try {
    const data = await getPlatformSupportTicketForCompany(req.companyId!, ticketId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(404).json({ success: false, error: err instanceof Error ? err.message : 'Bulunamadı' });
  }
}

export async function createMySupportTicket(req: AuthRequest, res: Response): Promise<void> {
  const { subject, message, category, priority } = req.body;

  if (!subject?.trim() || !message?.trim()) {
    res.status(400).json({ success: false, error: 'Konu ve mesaj zorunludur' });
    return;
  }

  if (isDemoSession(req)) {
    res.status(400).json({ success: false, error: 'Demo modda talep oluşturulamaz' });
    return;
  }

  try {
    const data = await createPlatformSupportTicket(
      req.companyId!,
      { subject, message, category, priority },
      {
        profileId: req.profile?.id,
        name: req.profile?.full_name,
        email: undefined,
      }
    );

    await logActivity({
      userId: req.userId,
      companyId: req.companyId,
      action: 'platform_support_ticket_created',
      entityType: 'platform_support_ticket',
      entityId: data.id,
      metadata: { subject: data.subject, category: data.category },
    });

    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}

export async function replyMySupportTicket(req: AuthRequest, res: Response): Promise<void> {
  const ticketId = req.params.id as string;
  const { message } = req.body;

  if (!message?.trim()) {
    res.status(400).json({ success: false, error: 'Mesaj gerekli' });
    return;
  }

  if (isDemoSession(req)) {
    res.status(400).json({ success: false, error: 'Demo modda mesaj gönderilemez' });
    return;
  }

  try {
    const data = await addPlatformSupportCustomerMessage(req.companyId!, ticketId, message, {
      profileId: req.profile?.id,
      name: req.profile?.full_name,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Hata' });
  }
}
