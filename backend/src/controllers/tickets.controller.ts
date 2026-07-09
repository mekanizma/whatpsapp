/**
 * Tickets controller - live support management
 */

import { Response } from 'express';
import { adminClient } from '../database/supabase';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
import { logActivity } from '../services/log.service';
import { clearTransferState, normalizePhoneNumber } from '../whatsapp/message.handler';
import { createTicketAndNotify, notifyTicketRecipients } from '../services/ticket-notification.service';
import {
  getStaffDepartmentId,
  getStaffRecord,
  resolveStaffIdForProfile,
  validateDepartmentBelongsToCompany,
} from '../services/department-access.service';
import { mapTicketRow } from '../utils/supabase-join';

const TICKET_SELECT =
  '*, staff:assigned_staff(name, email), last_staff:last_assigned_staff(name, email), department:department_id(id, name)';

function withLastAssignedStaff(updates: Record<string, unknown>): Record<string, unknown> {
  const staffId = updates.assigned_staff;
  if (typeof staffId === 'string' && staffId) {
    return { ...updates, last_assigned_staff: staffId };
  }
  return updates;
}

async function getStaffIdForProfile(
  companyId: string,
  profileId?: string
): Promise<string | null> {
  const staff = await getStaffRecord(companyId, profileId);
  return staff?.id || null;
}

async function canUserTransferTicket(
  req: AuthRequest,
  ticket: { status: string; assigned_staff: string | null; department_id: string | null }
): Promise<boolean> {
  if (req.role === 'company_admin' || req.role === 'super_admin') return true;
  if (req.role !== 'staff') return false;

  const staff = await getStaffRecord(req.companyId!, req.profile?.id);
  if (!staff) return false;

  if (ticket.status === 'in_progress' && ticket.assigned_staff === staff.id) return true;

  if (ticket.status === 'open') {
    if (!staff.department_id) return true;
    if (!ticket.department_id || ticket.department_id === staff.department_id) return true;
  }

  return false;
}

export async function getTickets(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({ success: true, data: [] });
    return;
  }

  const status = req.query.status as string;
  let query = adminClient
    .from('tickets')
    .select(TICKET_SELECT)
    .eq('company_id', req.companyId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  if (req.role === 'staff') {
    const staffDeptId = await getStaffDepartmentId(req.companyId!, req.profile?.id);
    const staffId = await getStaffIdForProfile(req.companyId!, req.profile?.id);

    if (staffDeptId) {
      query = query.eq('department_id', staffDeptId);
      if (staffId) {
        query = query.or(`status.eq.open,and(assigned_staff.eq.${staffId},status.eq.in_progress)`);
      } else {
        query = query.eq('status', 'open');
      }
    } else if (staffId) {
      query = query.or(`status.eq.open,and(assigned_staff.eq.${staffId},status.eq.in_progress)`);
    } else {
      query = query.eq('status', 'open');
    }
  }

  const { data, error } = await query;

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data: (data || []).map(mapTicketRow) });
}

export async function getActiveTicketByPhone(req: AuthRequest, res: Response): Promise<void> {
  const phone = normalizePhoneNumber(req.params.phone as string)
    || (req.params.phone as string).replace(/\D/g, '');

  const { data, error } = await adminClient
    .from('tickets')
    .select(TICKET_SELECT)
    .eq('company_id', req.companyId)
    .eq('customer_phone', phone)
    .in('status', ['open', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data: data ? mapTicketRow(data) : null });
}

export async function createTicket(req: AuthRequest, res: Response): Promise<void> {
  const { customer_phone, customer_name, subject, priority, department_id } = req.body;

  try {
    const { created, ticket } = await createTicketAndNotify(req.companyId!, {
      customer_phone,
      customer_name,
      subject,
      priority: priority || 'medium',
      department_id: department_id || null,
    });

    if (!created) {
      res.status(409).json({ success: false, error: 'Bu müşteri için zaten açık bir destek talebi var' });
      return;
    }

    const { data, error } = await adminClient
      .from('tickets')
      .select(TICKET_SELECT)
      .eq('id', ticket!.id)
      .single();

    if (error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    res.status(201).json({ success: true, data: mapTicketRow(data) });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
}

export async function updateTicket(req: AuthRequest, res: Response): Promise<void> {
  const { status, priority, assigned_staff } = req.body;
  const updates: Record<string, unknown> = {};

  if (status) updates.status = status;
  if (priority) updates.priority = priority;
  if (assigned_staff !== undefined) updates.assigned_staff = assigned_staff;
  if (status === 'closed' || status === 'resolved') updates.closed_at = new Date().toISOString();

  const patch = withLastAssignedStaff(updates);

  const { data, error } = await adminClient
    .from('tickets')
    .update(patch)
    .eq('id', req.params.id)
    .eq('company_id', req.companyId)
    .select(TICKET_SELECT)
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  if (status === 'resolved' || status === 'closed') {
    clearTransferState(req.companyId!, data.customer_phone);
  }

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'ticket_updated',
    entityType: 'ticket',
    entityId: data.id,
    metadata: patch,
  });

  res.json({ success: true, data: mapTicketRow(data) });
}

/** Ticket'ı mevcut kullanıcıya ata ve işleme al */
export async function claimTicket(req: AuthRequest, res: Response): Promise<void> {
  const staffId = await resolveStaffIdForProfile(
    req.companyId!,
    req.profile?.id,
    req.userId
  );
  if (!staffId) {
    res.status(400).json({ success: false, error: 'Personel kaydı oluşturulamadı' });
    return;
  }

  const staffDeptId = await getStaffDepartmentId(req.companyId!, req.profile?.id);

  let claimQuery = adminClient
    .from('tickets')
    .update(
      withLastAssignedStaff({
        status: 'in_progress',
        assigned_staff: staffId,
      })
    )
    .eq('id', req.params.id)
    .eq('company_id', req.companyId)
    .in('status', ['open', 'in_progress']);

  if (req.role === 'staff' && staffDeptId) {
    claimQuery = claimQuery.eq('department_id', staffDeptId);
  }

  const { data, error } = await claimQuery
    .select(TICKET_SELECT)
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message || 'Talep üstlenilemedi' });
    return;
  }

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'ticket_claimed',
    entityType: 'ticket',
    entityId: data.id,
    metadata: { customer_phone: data.customer_phone, staff_id: staffId },
  });

  res.json({ success: true, data: mapTicketRow(data) });
}

export async function assignTicket(req: AuthRequest, res: Response): Promise<void> {
  const { staff_id } = req.body;

  const { data, error } = await adminClient
    .from('tickets')
    .update(
      withLastAssignedStaff({
        assigned_staff: staff_id,
        status: 'in_progress',
      })
    )
    .eq('id', req.params.id)
    .eq('company_id', req.companyId)
    .select(TICKET_SELECT)
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data: mapTicketRow(data) });
}

/** Aktif talebi başka departmana transfer et — atama sıfırlanır, yeni departman bildirilir */
export async function transferTicket(req: AuthRequest, res: Response): Promise<void> {
  const ticketId = req.params.id as string;
  const companyId = req.companyId!;
  const { department_id: targetDepartmentId } = req.body;

  if (!targetDepartmentId || typeof targetDepartmentId !== 'string') {
    res.status(400).json({ success: false, error: 'Hedef departman gerekli' });
    return;
  }

  const departmentValid = await validateDepartmentBelongsToCompany(companyId, targetDepartmentId);
  if (!departmentValid) {
    res.status(400).json({ success: false, error: 'Geçersiz departman' });
    return;
  }

  const { data: ticket, error: fetchError } = await adminClient
    .from('tickets')
    .select('id, status, assigned_staff, last_assigned_staff, department_id, customer_phone, customer_name, subject, priority')
    .eq('id', ticketId)
    .eq('company_id', companyId)
    .single();

  if (fetchError || !ticket) {
    res.status(404).json({ success: false, error: 'Talep bulunamadı' });
    return;
  }

  if (!['open', 'in_progress'].includes(ticket.status)) {
    res.status(400).json({
      success: false,
      error: 'Yalnızca açık veya işlemdeki talepler transfer edilebilir',
    });
    return;
  }

  if (ticket.department_id === targetDepartmentId) {
    res.status(400).json({ success: false, error: 'Talep zaten bu departmanda' });
    return;
  }

  const allowed = await canUserTransferTicket(req, ticket);
  if (!allowed) {
    res.status(403).json({ success: false, error: 'Bu talebi transfer etme yetkiniz yok' });
    return;
  }

  const actorStaffId = await resolveStaffIdForProfile(
    companyId,
    req.profile?.id,
    req.userId
  );

  const { data, error } = await adminClient
    .from('tickets')
    .update({
      department_id: targetDepartmentId,
      assigned_staff: null,
      last_assigned_staff:
        ticket.assigned_staff || ticket.last_assigned_staff || actorStaffId,
      status: 'open',
    })
    .eq('id', ticketId)
    .eq('company_id', companyId)
    .select(TICKET_SELECT)
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  void notifyTicketRecipients(companyId, {
    id: data.id,
    customer_phone: data.customer_phone,
    customer_name: data.customer_name,
    subject: data.subject,
    priority: data.priority,
    department_id: targetDepartmentId,
  });

  await logActivity({
    userId: req.userId,
    companyId,
    action: 'ticket_transferred',
    entityType: 'ticket',
    entityId: ticketId,
    metadata: {
      from_department_id: ticket.department_id,
      to_department_id: targetDepartmentId,
      customer_phone: ticket.customer_phone,
    },
  });

  res.json({ success: true, data: mapTicketRow(data) });
}
