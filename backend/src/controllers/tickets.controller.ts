/**
 * Tickets controller - live support management
 */

import { Response } from 'express';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../services/log.service';
import { clearTransferState } from '../whatsapp/message.handler';
import { normalizePhoneNumber } from '../whatsapp/message.handler';

async function getStaffIdForProfile(
  companyId: string,
  profileId?: string
): Promise<string | null> {
  if (!profileId) return null;
  const { data } = await adminClient
    .from('staff')
    .select('id')
    .eq('profile_id', profileId)
    .eq('company_id', companyId)
    .single();
  return data?.id || null;
}

export async function getTickets(req: AuthRequest, res: Response): Promise<void> {
  if (config.demoMode) {
    res.json({ success: true, data: [] });
    return;
  }

  const status = req.query.status as string;
  let query = adminClient
    .from('tickets')
    .select('*, staff:assigned_staff(name, email)')
    .eq('company_id', req.companyId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  if (req.role === 'staff') {
    const staffId = await getStaffIdForProfile(req.companyId!, req.profile?.id);
    if (staffId) {
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

  res.json({ success: true, data });
}

export async function getActiveTicketByPhone(req: AuthRequest, res: Response): Promise<void> {
  const phone = normalizePhoneNumber(req.params.phone as string)
    || (req.params.phone as string).replace(/\D/g, '');

  const { data, error } = await adminClient
    .from('tickets')
    .select('*, staff:assigned_staff(name, email)')
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

  res.json({ success: true, data: data || null });
}

export async function createTicket(req: AuthRequest, res: Response): Promise<void> {
  const { customer_phone, customer_name, subject, priority } = req.body;

  const { data, error } = await adminClient
    .from('tickets')
    .insert({
      company_id: req.companyId,
      customer_phone,
      customer_name,
      subject,
      priority: priority || 'medium',
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  res.status(201).json({ success: true, data });
}

export async function updateTicket(req: AuthRequest, res: Response): Promise<void> {
  const { status, priority, assigned_staff } = req.body;
  const updates: Record<string, unknown> = {};

  if (status) updates.status = status;
  if (priority) updates.priority = priority;
  if (assigned_staff !== undefined) updates.assigned_staff = assigned_staff;
  if (status === 'closed' || status === 'resolved') updates.closed_at = new Date().toISOString();

  const { data, error } = await adminClient
    .from('tickets')
    .update(updates)
    .eq('id', req.params.id)
    .eq('company_id', req.companyId)
    .select()
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
    metadata: updates,
  });

  res.json({ success: true, data });
}

/** Ticket'ı mevcut kullanıcıya ata ve işleme al */
export async function claimTicket(req: AuthRequest, res: Response): Promise<void> {
  const staffId = await getStaffIdForProfile(req.companyId!, req.profile?.id);

  const { data, error } = await adminClient
    .from('tickets')
    .update({
      status: 'in_progress',
      assigned_staff: staffId,
    })
    .eq('id', req.params.id)
    .eq('company_id', req.companyId)
    .in('status', ['open', 'in_progress'])
    .select('*, staff:assigned_staff(name, email)')
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

  res.json({ success: true, data });
}

export async function assignTicket(req: AuthRequest, res: Response): Promise<void> {
  const { staff_id } = req.body;

  const { data, error } = await adminClient
    .from('tickets')
    .update({ assigned_staff: staff_id, status: 'in_progress' })
    .eq('id', req.params.id)
    .eq('company_id', req.companyId)
    .select()
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data });
}
