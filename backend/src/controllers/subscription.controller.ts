/**
 * Subscription controller
 */

import { Response } from 'express';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { demoPlans, demoSubscriptionUsage } from '../demo/mockData';
import { AuthRequest } from '../middleware/auth.middleware';

export async function getCurrentSubscription(req: AuthRequest, res: Response): Promise<void> {
  const { data, error } = await adminClient
    .from('subscriptions')
    .select('*, plan:plan_id(*)')
    .eq('company_id', req.companyId)
    .single();

  if (error) {
    res.status(404).json({ success: false, error: 'Abonelik bulunamadı' });
    return;
  }

  res.json({ success: true, data });
}

export async function getUsage(req: AuthRequest, res: Response): Promise<void> {
  if (config.demoMode) {
    res.json({ success: true, data: demoSubscriptionUsage });
    return;
  }

  const { data: sub } = await adminClient
    .from('subscriptions')
    .select('messages_used, messages_limit, users_limit, status')
    .eq('company_id', req.companyId)
    .single();

  const { count: staffCount } = await adminClient
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', req.companyId)
    .eq('is_active', true);

  res.json({
    success: true,
    data: {
      messages_used: sub?.messages_used || 0,
      messages_limit: sub?.messages_limit || 1000,
      users_used: staffCount || 0,
      users_limit: sub?.users_limit || 1,
      status: sub?.status || 'trial',
      messages_percentage: sub
        ? Math.round((sub.messages_used / sub.messages_limit) * 100)
        : 0,
    },
  });
}

export async function getPlans(_req: AuthRequest, res: Response): Promise<void> {
  if (config.demoMode) {
    res.json({ success: true, data: demoPlans });
    return;
  }

  const { data, error } = await adminClient
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true });

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data });
}
