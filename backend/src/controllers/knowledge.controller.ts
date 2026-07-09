/**
 * Knowledge base controller — CRUD + async RAG indexing
 */

import { Response } from 'express';
import { adminClient } from '../database/supabase';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
import { logActivity } from '../services/log.service';
import { parseKnowledgeDocument } from '../services/document-parser.service';
import {
  scheduleKnowledgeIndexing,
  indexKnowledgeItem,
  indexKnowledgeWithRetry,
  setKnowledgeItemActive,
} from '../services/knowledge-index.service';
import { getKnowledgeChunkPreviews } from '../services/knowledge-retrieval.service';
import { clearCompanyCache } from '../ai/ai-cache.service';
import {
  companyHasActiveDepartments,
  getStaffDepartmentId,
  validateDepartmentBelongsToCompany,
} from '../services/department-access.service';
import { isSuperStaffRole } from '../services/staff-permissions.service';

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

async function resolveKnowledgeDepartmentId(
  req: AuthRequest,
  requestedDepartmentId?: string | null
): Promise<{ departmentId: string | null; error?: string }> {
  const hasDepartments = await companyHasActiveDepartments(req.companyId!);

  if (req.role === 'staff') {
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

async function assertStaffCanAccessKnowledge(
  req: AuthRequest,
  knowledgeId: string
): Promise<{ ok: boolean; error?: string }> {
  if (req.role !== 'staff') return { ok: true };

  // Süper personel (supervisor) şirketin tüm bilgi bankası kayıtlarına erişebilir
  if (isSuperStaffRole(req.staffRole)) return { ok: true };

  const staffDeptId = await getStaffDepartmentId(req.companyId!, req.profile?.id);
  if (!staffDeptId) {
    return { ok: false, error: 'Personel departmanı tanımlı değil' };
  }

  const { data } = await adminClient
    .from('knowledge_base')
    .select('department_id')
    .eq('id', knowledgeId)
    .eq('company_id', req.companyId)
    .maybeSingle();

  if (!data) return { ok: false, error: 'Kayıt bulunamadı' };
  if (data.department_id && data.department_id !== staffDeptId) {
    return { ok: false, error: 'Bu kayıt için yetkiniz yok' };
  }

  return { ok: true };
}

export async function getKnowledgeItems(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({ success: true, data: [] });
    return;
  }

  let query = adminClient
    .from('knowledge_base')
    .select('*, department:department_id(id, name)')
    .eq('company_id', req.companyId)
    .order('created_at', { ascending: false });

  // Normal personel departman bazlı filtrelenir; supervisor tüm şirket kayıtlarını görür
  // (yöneticinin department_id=null eklediği genel kayıtlar dahil)
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

  res.json({ success: true, data });
}

export async function createKnowledgeItem(req: AuthRequest, res: Response): Promise<void> {
  const { title, content, category, source_filename, department_id } = req.body;
  const charCount = typeof content === 'string' ? content.length : 0;

  const dept = await resolveKnowledgeDepartmentId(req, department_id);
  if (dept.error) {
    res.status(400).json({ success: false, error: dept.error });
    return;
  }

  const { data, error } = await adminClient
    .from('knowledge_base')
    .insert({
      company_id: req.companyId,
      title,
      content,
      category,
      department_id: dept.departmentId,
      source_filename: source_filename || null,
      char_count: charCount,
      index_status: 'pending',
      chunk_count: 0,
      index_error: null,
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await indexKnowledgeWithRetry(data.id, req.companyId!);
  await clearCompanyCache(req.companyId!);

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'knowledge_created',
    entityType: 'knowledge_base',
    entityId: data.id,
    metadata: { char_count: charCount, department_id: dept.departmentId },
  });

  res.status(201).json({ success: true, data });
}

export async function updateKnowledgeItem(req: AuthRequest, res: Response): Promise<void> {
  const id = paramId(req.params.id);
  const { title, content, category, is_active, source_filename, department_id } = req.body;

  const access = await assertStaffCanAccessKnowledge(req, id);
  if (!access.ok) {
    res.status(403).json({ success: false, error: access.error });
    return;
  }

  const charCount = typeof content === 'string' ? content.length : undefined;
  const updates: Record<string, unknown> = {
    ...(title !== undefined ? { title } : {}),
    ...(content !== undefined ? { content } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(is_active !== undefined ? { is_active } : {}),
    index_status: 'pending',
    index_error: null,
    ...(source_filename !== undefined ? { source_filename } : {}),
    ...(charCount !== undefined ? { char_count: charCount } : {}),
  };

  if (req.role === 'company_admin' && department_id !== undefined) {
    if (department_id) {
      const valid = await validateDepartmentBelongsToCompany(req.companyId!, department_id);
      if (!valid) {
        res.status(400).json({ success: false, error: 'Geçersiz departman' });
        return;
      }
    }
    updates.department_id = department_id || null;
  }

  const { data, error } = await adminClient
    .from('knowledge_base')
    .update(updates)
    .eq('id', id)
    .eq('company_id', req.companyId)
    .select()
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await indexKnowledgeWithRetry(data.id, req.companyId!);
  await clearCompanyCache(req.companyId!);

  res.json({ success: true, data });
}

export async function patchKnowledgeItemActive(req: AuthRequest, res: Response): Promise<void> {
  const id = paramId(req.params.id);
  const { is_active } = req.body;

  if (typeof is_active !== 'boolean') {
    res.status(400).json({ success: false, error: 'is_active alanı zorunludur' });
    return;
  }

  const access = await assertStaffCanAccessKnowledge(req, id);
  if (!access.ok) {
    res.status(403).json({ success: false, error: access.error });
    return;
  }

  const { data: existing } = await adminClient
    .from('knowledge_base')
    .select('id, is_active')
    .eq('id', id)
    .eq('company_id', req.companyId)
    .maybeSingle();

  if (!existing) {
    res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
    return;
  }

  if (existing.is_active === is_active) {
    const { data } = await adminClient
      .from('knowledge_base')
      .select('*, department:department_id(id, name)')
      .eq('id', id)
      .eq('company_id', req.companyId)
      .single();
    res.json({ success: true, data });
    return;
  }

  await setKnowledgeItemActive(id, req.companyId!, is_active);
  await clearCompanyCache(req.companyId!);

  const { data, error } = await adminClient
    .from('knowledge_base')
    .select('*, department:department_id(id, name)')
    .eq('id', id)
    .eq('company_id', req.companyId)
    .single();

  if (error || !data) {
    res.status(400).json({ success: false, error: error?.message || 'Güncelleme başarısız' });
    return;
  }

  res.json({ success: true, data });
}

export async function deleteKnowledgeItem(req: AuthRequest, res: Response): Promise<void> {
  const id = paramId(req.params.id);

  const access = await assertStaffCanAccessKnowledge(req, id);
  if (!access.ok) {
    res.status(403).json({ success: false, error: access.error });
    return;
  }

  const { error } = await adminClient
    .from('knowledge_base')
    .delete()
    .eq('id', id)
    .eq('company_id', req.companyId);

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await clearCompanyCache(req.companyId!);

  res.json({ success: true, message: 'Bilgi silindi' });
}

export async function parseKnowledgeFile(req: AuthRequest, res: Response): Promise<void> {
  const file = req.file;

  if (!file) {
    res.status(400).json({ success: false, error: 'Lütfen bir dosya seçin' });
    return;
  }

  try {
    const parsed = await parseKnowledgeDocument(file.buffer, file.originalname, file.mimetype);

    await logActivity({
      userId: req.userId,
      companyId: req.companyId,
      action: 'knowledge_file_parsed',
      entityType: 'knowledge_base',
      metadata: {
        filename: parsed.source_filename,
        file_type: parsed.file_type,
        char_count: parsed.char_count,
        truncated: parsed.truncated,
        chunk_estimate: parsed.chunk_estimate,
      },
    });

    res.json({ success: true, data: parsed });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
}

export async function reindexKnowledgeItem(req: AuthRequest, res: Response): Promise<void> {
  const id = paramId(req.params.id);

  const access = await assertStaffCanAccessKnowledge(req, id);
  if (!access.ok) {
    res.status(403).json({ success: false, error: access.error });
    return;
  }

  const { data: kb, error } = await adminClient
    .from('knowledge_base')
    .select('id')
    .eq('id', id)
    .eq('company_id', req.companyId)
    .single();

  if (error || !kb) {
    res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
    return;
  }

  scheduleKnowledgeIndexing(id, req.companyId!);
  res.json({ success: true, message: 'İndeksleme kuyruğa alındı' });
}

export async function getKnowledgeIndexStatus(req: AuthRequest, res: Response): Promise<void> {
  const id = paramId(req.params.id);

  const access = await assertStaffCanAccessKnowledge(req, id);
  if (!access.ok) {
    res.status(403).json({ success: false, error: access.error });
    return;
  }

  const { data, error } = await adminClient
    .from('knowledge_base')
    .select('id, title, index_status, chunk_count, index_error, char_count, updated_at')
    .eq('id', id)
    .eq('company_id', req.companyId)
    .single();

  if (error || !data) {
    res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
    return;
  }

  res.json({ success: true, data });
}

export async function getKnowledgeChunks(req: AuthRequest, res: Response): Promise<void> {
  const id = paramId(req.params.id);
  const limit = Math.min(parseInt(String(req.query.limit || '5'), 10) || 5, 20);

  const access = await assertStaffCanAccessKnowledge(req, id);
  if (!access.ok) {
    res.status(403).json({ success: false, error: access.error });
    return;
  }

  const { data: kb } = await adminClient
    .from('knowledge_base')
    .select('id')
    .eq('id', id)
    .eq('company_id', req.companyId)
    .single();

  if (!kb) {
    res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
    return;
  }

  const result = await getKnowledgeChunkPreviews(req.companyId!, id, limit);
  res.json({ success: true, data: result });
}

/** Immediate indexing (admin debug / manual trigger) */
export async function indexKnowledgeNow(req: AuthRequest, res: Response): Promise<void> {
  const id = paramId(req.params.id);

  const access = await assertStaffCanAccessKnowledge(req, id);
  if (!access.ok) {
    res.status(403).json({ success: false, error: access.error });
    return;
  }

  const { data: kb } = await adminClient
    .from('knowledge_base')
    .select('id')
    .eq('id', id)
    .eq('company_id', req.companyId)
    .single();

  if (!kb) {
    res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
    return;
  }

  await indexKnowledgeItem(id, req.companyId!);

  const { data } = await adminClient
    .from('knowledge_base')
    .select('index_status, chunk_count, index_error')
    .eq('id', id)
    .single();

  res.json({ success: true, data });
}
