/**
 * Company controller - company management operations
 */

import { Response } from 'express';
import { adminClient } from '../database/supabase';
import { demoCompany } from '../demo/mockData';
import {
  AuthRequest,
  denyUnlessCompanyAccess,
  isDemoSession,
  resolveAuthorizedCompanyId,
} from '../middleware/auth.middleware';
import { getDashboardStats } from '../services/dashboard.service';
import { getAICostReport } from '../services/ai-cost.service';
import { logActivity } from '../services/log.service';
import { validateWorkingHoursForWrite } from '../services/working-hours.service';
import { validateCompanyTimezoneForWrite } from '../services/company-timezone.service';
import { validateCustomInstructionsForWrite } from '../services/custom-instructions.service';
import { invalidateStaticSystemPromptCache } from '../ai/admin-prompt-builder';
import { clearCompanyCache } from '../ai/ai-cache.service';
import { invalidateCompanyCache } from '../ai/openai.service';

export async function getCompany(req: AuthRequest, res: Response): Promise<void> {
  const companyId = resolveAuthorizedCompanyId(req, req.params.id as string | undefined);
  if (!denyUnlessCompanyAccess(req, res, companyId)) return;

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
  const companyId = resolveAuthorizedCompanyId(req, req.params.id as string | undefined);
  if (!denyUnlessCompanyAccess(req, res, companyId)) return;
  const { company_name, category, phone, email, address, working_hours, timezone, logo, custom_instructions } = req.body;

  let validatedWorkingHours: Record<string, unknown> | undefined;
  if (working_hours !== undefined) {
    const wh = validateWorkingHoursForWrite(working_hours);
    if (!wh.ok) {
      res.status(400).json({ success: false, error: wh.error });
      return;
    }
    validatedWorkingHours = wh.data;
  }

  let validatedTimezone: string | undefined;
  if (timezone !== undefined) {
    const tz = validateCompanyTimezoneForWrite(timezone);
    if (!tz.ok) {
      res.status(400).json({ success: false, error: tz.error });
      return;
    }
    validatedTimezone = tz.timezone;
  }

  let validatedCustomInstructions: string | null | undefined;
  let customInstructionsProvided = false;
  if (custom_instructions !== undefined) {
    const ci = validateCustomInstructionsForWrite(custom_instructions);
    if (!ci.ok) {
      res.status(400).json({ success: false, error: ci.error });
      return;
    }
    if (ci.provided) {
      customInstructionsProvided = true;
      validatedCustomInstructions = ci.value;
    }
  }

  if (isDemoSession(req)) {
    if (company_name !== undefined) demoCompany.company_name = company_name;
    if (category !== undefined) demoCompany.category = category;
    if (phone !== undefined) demoCompany.phone = phone;
    if (email !== undefined) demoCompany.email = email;
    if (address !== undefined) demoCompany.address = address;
    if (validatedWorkingHours !== undefined) demoCompany.working_hours = validatedWorkingHours;
    if (validatedTimezone !== undefined) demoCompany.timezone = validatedTimezone;
    if (logo !== undefined) demoCompany.logo = logo;
    if (customInstructionsProvided) demoCompany.custom_instructions = validatedCustomInstructions ?? null;
    res.json({ success: true, data: demoCompany });
    return;
  }

  const updatePayload: Record<string, unknown> = {
    company_name,
    category,
    phone,
    email,
    address,
    logo,
  };
  if (validatedWorkingHours !== undefined) updatePayload.working_hours = validatedWorkingHours;
  if (validatedTimezone !== undefined) updatePayload.timezone = validatedTimezone;
  if (customInstructionsProvided) updatePayload.custom_instructions = validatedCustomInstructions;

  const { data, error } = await adminClient
    .from('companies')
    .update(updatePayload)
    .eq('id', companyId)
    .select()
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  if (customInstructionsProvided) {
    invalidateStaticSystemPromptCache(companyId as string);
    invalidateCompanyCache(companyId as string);
    await clearCompanyCache(companyId as string);
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
  const companyId = resolveAuthorizedCompanyId(req, req.params.id as string | undefined);
  if (!denyUnlessCompanyAccess(req, res, companyId)) return;

  const stats = await getDashboardStats(companyId as string, isDemoSession(req));
  res.json({ success: true, data: stats });
}

export async function getAICostReportHandler(req: AuthRequest, res: Response): Promise<void> {
  const companyId = resolveAuthorizedCompanyId(req, req.params.id as string | undefined);
  if (!denyUnlessCompanyAccess(req, res, companyId)) return;

  const days = Math.min(parseInt(String(req.query.days || '30'), 10) || 30, 90);

  try {
    const report = await getAICostReport(companyId, days);
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Maliyet raporu alınamadı',
    });
  }
}
