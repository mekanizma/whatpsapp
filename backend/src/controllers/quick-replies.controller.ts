/**
 * Departman bazlı hazır cevap CRUD
 */

import { Response } from 'express';
import { adminClient } from '../database/supabase';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
import { logActivity } from '../services/log.service';
import {
  companyHasActiveDepartments,
  getStaffDepartmentId,
  validateDepartmentBelongsToCompany,
} from '../services/department-access.service';
import { isSuperStaffRole } from '../services/staff-permissions.service';

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

async function resolveQuickReplyDepartmentId(
  req: AuthRequest,
  requestedDepartmentId?: string | null
): Promise<{ departmentId: string | null; error?: string }> {
  const hasDepartments = await companyHasActiveDepartments(req.companyId!);

  if (req.role === 'staff') {
    if (isSuperStaffRole(req.staffRole)) {
      if (requestedDepartmentId) {
        const valid = await validateDepartmentBelongsToCompany(req.companyId!, requestedDepartmentId);
        if (!valid) return { departmentId: null, error: 'Geçersiz departman' };
        return { departmentId: requestedDepartmentId };
      }
      return { departmentId: null };
    }

    const staffDeptId = await getStaffDepartmentId(req.companyId!, req.profile?.id);
    if (!staffDeptId) {
      return { departmentId: null, error: 'Personel departmanı tanımlı değil' };
    }
    return { departmentId: staffDeptId };
  }

  if (hasDepartments && !requestedDepartmentId) {
    return { departmentId: null, error: 'Departman seçimi zorunludur' };
  }

  if (requestedDepartmentId) {
    const valid = await validateDepartmentBelongsToCompany(req.companyId!, requestedDepartmentId);
    if (!valid) {
      return { departmentId: null, error: 'Geçersiz departman' };
    }
    return { departmentId: requestedDepartmentId };
  }

  return { departmentId: null };
}

async function assertStaffCanAccessQuickReply(
  req: AuthRequest,
  replyId: string
): Promise<{ ok: boolean; error?: string; row?: { id: string; department_id: string | null } }> {
  const { data } = await adminClient
    .from('quick_replies')
    .select('id, department_id')
    .eq('id', replyId)
    .eq('company_id', req.companyId)
    .maybeSingle();

  if (!data) return { ok: false, error: 'Kayıt bulunamadı' };

  if (req.role !== 'staff') return { ok: true, row: data };
  if (isSuperStaffRole(req.staffRole)) return { ok: true, row: data };

  const staffDeptId = await getStaffDepartmentId(req.companyId!, req.profile?.id);
  if (!staffDeptId) {
    return { ok: false, error: 'Personel departmanı tanımlı değil' };
  }

  if (data.department_id && data.department_id !== staffDeptId) {
    return { ok: false, error: 'Bu kayıt için yetkiniz yok' };
  }

  return { ok: true, row: data };
}

export async function getQuickReplies(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({ success: true, data: [] });
    return;
  }

  const activeOnly = String(req.query.active || '') === '1' || String(req.query.active || '') === 'true';

  let query = adminClient
    .from('quick_replies')
    .select('*, department:department_id(id, name)')
    .eq('company_id', req.companyId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  // Normal personel: kendi departmanı (+ şirket geneli null)
  if (req.role === 'staff' && !isSuperStaffRole(req.staffRole)) {
    const staffDeptId = await getStaffDepartmentId(req.companyId!, req.profile?.id);
    if (!staffDeptId) {
      res.json({ success: true, data: [] });
      return;
    }
    query = query.or(`department_id.eq.${staffDeptId},department_id.is.null`);
  }

  const { data, error } = await query;

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data: data || [] });
}

export async function createQuickReply(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.status(403).json({ success: false, error: 'Demo oturumunda işlem yapılamaz' });
    return;
  }

  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  const sortOrder = Number.isFinite(Number(req.body?.sort_order))
    ? Math.max(0, Math.floor(Number(req.body.sort_order)))
    : 0;

  if (!title || !body) {
    res.status(400).json({ success: false, error: 'Başlık ve içerik zorunludur' });
    return;
  }

  const resolved = await resolveQuickReplyDepartmentId(
    req,
    req.body?.department_id ? String(req.body.department_id) : null
  );
  if (resolved.error) {
    res.status(400).json({ success: false, error: resolved.error });
    return;
  }

  const { data, error } = await adminClient
    .from('quick_replies')
    .insert({
      company_id: req.companyId,
      department_id: resolved.departmentId,
      title,
      body,
      sort_order: sortOrder,
      is_active: true,
      created_by: req.profile?.id || null,
    })
    .select('*, department:department_id(id, name)')
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'quick_reply_created',
    entityType: 'quick_replies',
    entityId: data.id,
    metadata: { title, department_id: resolved.departmentId },
  });

  res.status(201).json({ success: true, data });
}

export async function updateQuickReply(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.status(403).json({ success: false, error: 'Demo oturumunda işlem yapılamaz' });
    return;
  }

  const id = paramId(req.params.id);
  const access = await assertStaffCanAccessQuickReply(req, id);
  if (!access.ok) {
    res.status(access.error === 'Kayıt bulunamadı' ? 404 : 403).json({
      success: false,
      error: access.error,
    });
    return;
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (req.body?.title !== undefined) {
    const title = String(req.body.title || '').trim();
    if (!title) {
      res.status(400).json({ success: false, error: 'Başlık boş olamaz' });
      return;
    }
    updates.title = title;
  }

  if (req.body?.body !== undefined) {
    const body = String(req.body.body || '').trim();
    if (!body) {
      res.status(400).json({ success: false, error: 'İçerik boş olamaz' });
      return;
    }
    updates.body = body;
  }

  if (req.body?.sort_order !== undefined) {
    const sortOrder = Number(req.body.sort_order);
    if (!Number.isFinite(sortOrder)) {
      res.status(400).json({ success: false, error: 'Geçersiz sıra' });
      return;
    }
    updates.sort_order = Math.max(0, Math.floor(sortOrder));
  }

  if (req.body?.is_active !== undefined) {
    updates.is_active = Boolean(req.body.is_active);
  }

  // Departman değişikliği: yalnızca yönetici / süper personel
  if (req.body?.department_id !== undefined) {
    const canChangeDept =
      req.role === 'company_admin' || (req.role === 'staff' && isSuperStaffRole(req.staffRole));
    if (!canChangeDept) {
      res.status(403).json({ success: false, error: 'Departman değiştirme yetkiniz yok' });
      return;
    }

    const requested = req.body.department_id ? String(req.body.department_id) : null;
    if (requested) {
      const valid = await validateDepartmentBelongsToCompany(req.companyId!, requested);
      if (!valid) {
        res.status(400).json({ success: false, error: 'Geçersiz departman' });
        return;
      }
    } else {
      const hasDepartments = await companyHasActiveDepartments(req.companyId!);
      if (hasDepartments && req.role === 'company_admin') {
        res.status(400).json({ success: false, error: 'Departman seçimi zorunludur' });
        return;
      }
    }
    updates.department_id = requested;
  }

  const { data, error } = await adminClient
    .from('quick_replies')
    .update(updates)
    .eq('id', id)
    .eq('company_id', req.companyId)
    .select('*, department:department_id(id, name)')
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'quick_reply_updated',
    entityType: 'quick_replies',
    entityId: id,
  });

  res.json({ success: true, data });
}

export async function deleteQuickReply(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.status(403).json({ success: false, error: 'Demo oturumunda işlem yapılamaz' });
    return;
  }

  const id = paramId(req.params.id);
  const access = await assertStaffCanAccessQuickReply(req, id);
  if (!access.ok) {
    res.status(access.error === 'Kayıt bulunamadı' ? 404 : 403).json({
      success: false,
      error: access.error,
    });
    return;
  }

  const { error } = await adminClient
    .from('quick_replies')
    .delete()
    .eq('id', id)
    .eq('company_id', req.companyId);

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'quick_reply_deleted',
    entityType: 'quick_replies',
    entityId: id,
  });

  res.json({ success: true, data: { id } });
}
