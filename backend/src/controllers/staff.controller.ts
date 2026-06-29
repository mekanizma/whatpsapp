/**
 * Staff management controller
 */

import { Response } from 'express';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../services/log.service';

export async function getStaff(req: AuthRequest, res: Response): Promise<void> {
  if (config.demoMode) {
    res.json({ success: true, data: [] });
    return;
  }

  const { data, error } = await adminClient
    .from('staff')
    .select('*')
    .eq('company_id', req.companyId)
    .order('created_at', { ascending: false });

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data });
}

export async function createStaff(req: AuthRequest, res: Response): Promise<void> {
  const { name, email, role } = req.body;

  const { data, error } = await adminClient
    .from('staff')
    .insert({ company_id: req.companyId, name, email, role: role || 'agent' })
    .select()
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'staff_created',
    entityType: 'staff',
    entityId: data.id,
  });

  res.status(201).json({ success: true, data });
}

export async function updateStaff(req: AuthRequest, res: Response): Promise<void> {
  const { name, email, role, is_active } = req.body;

  const { data, error } = await adminClient
    .from('staff')
    .update({ name, email, role, is_active })
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

export async function deleteStaff(req: AuthRequest, res: Response): Promise<void> {
  const { error } = await adminClient
    .from('staff')
    .delete()
    .eq('id', req.params.id)
    .eq('company_id', req.companyId);

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, message: 'Personel silindi' });
}
