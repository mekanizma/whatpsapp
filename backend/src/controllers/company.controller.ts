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
import {
  deleteCompanyLogoFiles,
  uploadCompanyLogoFile,
} from '../services/company-logo.service';
import { validateCompanyCategoryForWrite } from '../constants/company-categories';

function buildCompanyUpdatePayload(body: Record<string, unknown>): {
  payload: Record<string, unknown>;
  categoryChanged: boolean;
} {
  const payload: Record<string, unknown> = {};
  let categoryChanged = false;

  if (body.company_name !== undefined) {
    payload.company_name = String(body.company_name).trim();
  }
  if (body.category !== undefined) {
    const validated = validateCompanyCategoryForWrite(body.category);
    if (!validated.ok) {
      throw new Error(validated.error);
    }
    payload.category = validated.category;
    categoryChanged = true;
  }
  if (body.phone !== undefined) {
    payload.phone = body.phone ? String(body.phone).trim() : null;
  }
  if (body.email !== undefined) {
    payload.email = body.email ? String(body.email).trim() : null;
  }
  if (body.address !== undefined) {
    payload.address = body.address ? String(body.address).trim() : null;
  }
  if (body.logo !== undefined) {
    payload.logo = body.logo ?? null;
  }

  return { payload, categoryChanged };
}

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
  const { working_hours, timezone, custom_instructions } = req.body;

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

  let updatePayload: Record<string, unknown>;
  let categoryChanged = false;
  try {
    const built = buildCompanyUpdatePayload(req.body as Record<string, unknown>);
    updatePayload = built.payload;
    categoryChanged = built.categoryChanged;
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'Geçersiz şirket bilgisi',
    });
    return;
  }

  if (isDemoSession(req)) {
    if (updatePayload.company_name !== undefined) {
      demoCompany.company_name = String(updatePayload.company_name);
    }
    if (updatePayload.category !== undefined) {
      demoCompany.category = updatePayload.category as typeof demoCompany.category;
    }
    if (updatePayload.phone !== undefined) {
      demoCompany.phone = updatePayload.phone as string | null;
    }
    if (updatePayload.email !== undefined) {
      demoCompany.email = updatePayload.email as string | null;
    }
    if (updatePayload.address !== undefined) {
      demoCompany.address = updatePayload.address as string | null;
    }
    if (validatedWorkingHours !== undefined) demoCompany.working_hours = validatedWorkingHours;
    if (validatedTimezone !== undefined) demoCompany.timezone = validatedTimezone;
    if (updatePayload.logo !== undefined) demoCompany.logo = updatePayload.logo as string | null;
    if (customInstructionsProvided) demoCompany.custom_instructions = validatedCustomInstructions ?? null;
    res.json({ success: true, data: demoCompany });
    return;
  }

  if (validatedWorkingHours !== undefined) updatePayload.working_hours = validatedWorkingHours;
  if (validatedTimezone !== undefined) updatePayload.timezone = validatedTimezone;
  if (customInstructionsProvided) updatePayload.custom_instructions = validatedCustomInstructions;

  if (!Object.keys(updatePayload).length) {
    res.status(400).json({ success: false, error: 'Güncellenecek alan bulunamadı' });
    return;
  }

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

  if (customInstructionsProvided || categoryChanged) {
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

export async function uploadCompanyLogo(req: AuthRequest, res: Response): Promise<void> {
  const companyId = resolveAuthorizedCompanyId(req, req.params.id as string | undefined);
  if (!denyUnlessCompanyAccess(req, res, companyId)) return;

  const file = req.file;
  if (!file?.buffer?.length) {
    res.status(400).json({ success: false, error: 'Logo dosyası gerekli' });
    return;
  }

  if (isDemoSession(req)) {
    const logo = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    demoCompany.logo = logo;
    res.json({ success: true, data: demoCompany });
    return;
  }

  try {
    const logo = await uploadCompanyLogoFile(
      companyId as string,
      file.buffer,
      file.mimetype,
      file.originalname
    );

    const { data, error } = await adminClient
      .from('companies')
      .update({ logo })
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
      action: 'company_logo_updated',
      entityType: 'company',
      entityId: companyId as string,
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Logo yüklenemedi',
    });
  }
}

export async function removeCompanyLogo(req: AuthRequest, res: Response): Promise<void> {
  const companyId = resolveAuthorizedCompanyId(req, req.params.id as string | undefined);
  if (!denyUnlessCompanyAccess(req, res, companyId)) return;

  if (isDemoSession(req)) {
    demoCompany.logo = null;
    res.json({ success: true, data: demoCompany });
    return;
  }

  await deleteCompanyLogoFiles(companyId as string);

  const { data, error } = await adminClient
    .from('companies')
    .update({ logo: null })
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
    action: 'company_logo_removed',
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
