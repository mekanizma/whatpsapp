/**
 * Auth controller - login, register, profile
 */

import { Response } from 'express';
import { adminClient } from '../database/supabase';
import { demoCompany, demoProfilesByToken, DEMO_TOKENS } from '../demo/mockData';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
import { logActivity } from '../services/log.service';

const DEMO_EMAILS: Record<string, string> = {
  [DEMO_TOKENS.admin]: 'admin@demo.com',
  [DEMO_TOKENS.company]: 'firma@demo.com',
  [DEMO_TOKENS.staff]: 'personel@demo.com',
};

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    const token = req.accessToken!;
    const profile = demoProfilesByToken[token];
    res.json({
      success: true,
      data: {
        profile,
        company: profile.company_id ? demoCompany : null,
        email: DEMO_EMAILS[token] || '',
      },
    });
    return;
  }

  const profile = req.profile;
  let company = null;
  let email: string | null = null;

  if (req.accessToken) {
    const { data: { user } } = await adminClient.auth.getUser(req.accessToken);
    email = user?.email || null;
  }

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
    data: { profile, company, email },
  });
}

export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  const { full_name, avatar_url } = req.body;

  if (isDemoSession(req)) {
    const token = req.accessToken!;
    const profile = demoProfilesByToken[token];
    if (full_name !== undefined) profile.full_name = full_name;
    if (avatar_url !== undefined) profile.avatar_url = avatar_url;
    res.json({ success: true, data: profile });
    return;
  }

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
