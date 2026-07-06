/**
 * Auth controller - login, register, profile
 */

import { Response } from 'express';
import { adminClient } from '../database/supabase';
import { demoCompany, demoPlans, demoProfilesByToken, DEMO_TOKENS } from '../demo/mockData';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
import { logActivity } from '../services/log.service';
import { mapSubscriptionToCompanyPlan } from '../services/plan-capabilities.service';
import { getStaffSubRoleForProfile } from '../services/staff-permissions.service';

const DEMO_EMAILS: Record<string, string> = {
  [DEMO_TOKENS.admin]: 'admin@demo.com',
  [DEMO_TOKENS.company]: 'firma@demo.com',
  [DEMO_TOKENS.staff]: 'personel@demo.com',
};

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    const token = req.accessToken!;
    const profile = demoProfilesByToken[token];
    const demoPlanRow = demoPlans.find((p) => p.plan_type === demoCompany.subscription_plan);
    const companyPlan = demoPlanRow
      ? {
          plan_type: demoPlanRow.plan_type,
          name: demoPlanRow.name,
          description: demoPlanRow.description,
          features: demoPlanRow.features,
          message_limit: demoPlanRow.message_limit,
          user_limit: demoPlanRow.user_limit,
          messages_limit: demoPlanRow.message_limit,
          messages_used: 0,
          users_limit: demoPlanRow.user_limit,
          status: 'active',
        }
      : null;

    const impersonating = !!(req.isImpersonating && profile.role === 'super_admin');

    res.json({
      success: true,
      data: {
        profile,
        company: profile.company_id || impersonating ? demoCompany : null,
        companyPlan: profile.company_id || impersonating ? companyPlan : null,
        email: DEMO_EMAILS[token] || '',
        impersonation: impersonating
          ? {
              active: true,
              company_id: demoCompany.id,
              company_name: demoCompany.company_name,
            }
          : { active: false, company_id: null, company_name: null },
      },
    });
    return;
  }

  const profile = req.profile;
  let company = null;
  let companyPlan = null;
  let email: string | null = null;
  let staffRole = req.staffRole ?? profile?.staff_role ?? null;

  if (req.accessToken) {
    const { data: { user } } = await adminClient.auth.getUser(req.accessToken);
    email = user?.email || null;
  }

  if (profile?.role === 'staff' && staffRole == null) {
    staffRole = await getStaffSubRoleForProfile(profile.id);
  }

  const enrichedProfile = profile
    ? { ...profile, staff_role: staffRole }
    : profile;

  const targetCompanyId =
    profile?.company_id || (req.isImpersonating ? req.companyId : null);

  if (targetCompanyId) {
    const [{ data }, { data: sub }] = await Promise.all([
      adminClient.from('companies').select('*').eq('id', targetCompanyId).single(),
      adminClient
        .from('subscriptions')
        .select(
          '*, subscription_plans(plan_type, name, description, features, message_limit, user_limit)'
        )
        .eq('company_id', targetCompanyId)
        .single(),
    ]);
    company = data;
    companyPlan = mapSubscriptionToCompanyPlan(sub as Record<string, unknown> | undefined);
  }

  res.json({
    success: true,
    data: {
      profile: enrichedProfile,
      company,
      companyPlan,
      email,
      impersonation: req.isImpersonating && req.companyId
        ? {
            active: true,
            company_id: req.companyId,
            company_name: company?.company_name ?? null,
          }
        : { active: false, company_id: null, company_name: null },
    },
  });
}

export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  const { full_name, avatar_url, phone } = req.body;

  if (isDemoSession(req)) {
    const token = req.accessToken!;
    const profile = demoProfilesByToken[token];
    if (full_name !== undefined) profile.full_name = full_name;
    if (avatar_url !== undefined) profile.avatar_url = avatar_url;
    if (phone !== undefined) (profile as { phone?: string | null }).phone = phone;
    res.json({ success: true, data: profile });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (full_name !== undefined) updates.full_name = full_name;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;
  if (phone !== undefined) updates.phone = phone?.trim() || null;

  const { data, error } = await adminClient
    .from('profiles')
    .update(updates)
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
