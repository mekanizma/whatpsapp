/**
 * Auth controller - login, register, profile
 */

import { Response } from 'express';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { demoCompany, demoProfilesByToken } from '../demo/mockData';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../services/log.service';

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  if (config.demoMode && req.accessToken && demoProfilesByToken[req.accessToken]) {
    const profile = demoProfilesByToken[req.accessToken];
    res.json({
      success: true,
      data: {
        profile,
        company: profile.company_id ? demoCompany : null,
      },
    });
    return;
  }

  const profile = req.profile;
  let company = null;

  if (profile?.company_id) {
    const { data } = await adminClient
      .from('companies')
      .select('*')
      .eq('id', profile.company_id)
      .single();
    company = data;
  }

  res.json({
    success: true,
    data: { profile, company },
  });
}

export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  const { full_name, avatar_url } = req.body;

  const { data, error } = await adminClient
    .from('profiles')
    .update({ full_name, avatar_url })
    .eq('user_id', req.userId)
    .select()
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'profile_updated',
    entityType: 'profile',
    entityId: data.id,
  });

  res.json({ success: true, data });
}
