/**
 * Subscription controller
 */

import { Response } from 'express';
import { adminClient } from '../database/supabase';
import { demoCompany, demoPlans, demoSubscriptionUsage, demoAiConversationAddons } from '../demo/mockData';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
import {
  getActiveAiConversationAddons,
  isQuotaExhausted,
  purchaseAiConversationAddon,
} from '../services/ai-addon.service';

export async function getCurrentSubscription(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    const plan = demoPlans.find((p) => p.plan_type === demoCompany.subscription_plan) || demoPlans[1];
    res.json({
      success: true,
      data: {
        messages_used: demoSubscriptionUsage.messages_used,
        messages_limit: demoSubscriptionUsage.messages_limit,
        users_limit: demoSubscriptionUsage.users_limit,
        status: demoSubscriptionUsage.status,
        plan,
      },
    });
    return;
  }

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
  if (isDemoSession(req)) {
    res.json({
      success: true,
      data: {
        ...demoSubscriptionUsage,
        plan_type: demoCompany.subscription_plan,
      },
    });
    return;
  }

  const { data: sub } = await adminClient
    .from('subscriptions')
    .select('messages_used, messages_limit, users_limit, status, plan:plan_id(plan_type)')
    .eq('company_id', req.companyId)
    .single();

  const { count: staffCount } = await adminClient
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', req.companyId)
    .eq('is_active', true);

  const messagesUsed = sub?.messages_used || 0;
  const messagesLimit = sub?.messages_limit || 1000;
  const planRow = Array.isArray(sub?.plan) ? sub.plan[0] : sub?.plan;
  const planType = planRow?.plan_type || null;

  res.json({
    success: true,
    data: {
      messages_used: messagesUsed,
      messages_limit: messagesLimit,
      users_used: staffCount || 0,
      users_limit: sub?.users_limit || 1,
      status: sub?.status || 'trial',
      messages_percentage: sub
        ? Math.round((messagesUsed / messagesLimit) * 100)
        : 0,
      quota_exhausted: isQuotaExhausted(messagesUsed, messagesLimit),
      plan_type: planType,
    },
  });
}

export async function getConversationAddons(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({ success: true, data: demoAiConversationAddons.filter((a) => a.is_active) });
    return;
  }

  try {
    const data = await getActiveAiConversationAddons();
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Paketler alınamadı' });
  }
}

export async function purchaseConversationAddon(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    const addon = demoAiConversationAddons.find((a) => a.id === String(req.params.id));
    if (!addon) {
      res.status(404).json({ success: false, error: 'Paket bulunamadı' });
      return;
    }
    res.json({
      success: true,
      data: {
        messages_limit: demoSubscriptionUsage.messages_limit + addon.conversation_count,
        messages_used: demoSubscriptionUsage.messages_used,
        addon,
      },
    });
    return;
  }

  if (!req.companyId) {
    res.status(403).json({ success: false, error: 'Şirket bağlamı gerekli' });
    return;
  }

  try {
    const data = await purchaseAiConversationAddon(req.companyId, String(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Satın alma başarısız' });
  }
}

export async function getPlans(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
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
