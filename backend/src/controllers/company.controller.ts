/**
 * Company controller - company management operations
 */

import { Response } from 'express';
import { adminClient } from '../database/supabase';
import { AuthRequest } from '../middleware/auth.middleware';
import { getDashboardStats } from '../services/dashboard.service';
import { logActivity } from '../services/log.service';

export async function getCompany(req: AuthRequest, res: Response): Promise<void> {
  const companyId = req.params.id || req.companyId;

  const { data, error } = await adminClient
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  if (error) {
    res.status(404).json({ success: false, error: 'Şirket bulunamadı' });
    return;
  }

  res.json({ success: true, data });
}

export async function updateCompany(req: AuthRequest, res: Response): Promise<void> {
  const companyId = req.params.id || req.companyId;
  const { company_name, category, phone, email, address, working_hours, logo } = req.body;

  const { data, error } = await adminClient
    .from('companies')
    .update({ company_name, category, phone, email, address, working_hours, logo })
    .eq('id', companyId)
    .select()
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await logActivity({
    userId: req.userId,
    companyId: companyId as string,
    action: 'company_updated',
    entityType: 'company',
    entityId: companyId as string,
  });

  res.json({ success: true, data });
}

export async function getDashboard(req: AuthRequest, res: Response): Promise<void> {
  const companyId = req.params.id || req.companyId;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'Şirket ID gerekli' });
    return;
  }

  const stats = await getDashboardStats(companyId as string);
  res.json({ success: true, data: stats });
}
