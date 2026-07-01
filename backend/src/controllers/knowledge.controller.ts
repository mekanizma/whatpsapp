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
} from '../services/knowledge-index.service';
import { getKnowledgeChunkPreviews } from '../services/knowledge-retrieval.service';

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export async function getKnowledgeItems(req: AuthRequest, res: Response): Promise<void> {
  if (isDemoSession(req)) {
    res.json({ success: true, data: [] });
    return;
  }

  const { data, error } = await adminClient
    .from('knowledge_base')
    .select('*')
    .eq('company_id', req.companyId)
    .order('created_at', { ascending: false });

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data });
}

export async function createKnowledgeItem(req: AuthRequest, res: Response): Promise<void> {
  const { title, content, category, source_filename } = req.body;
  const charCount = typeof content === 'string' ? content.length : 0;

  const { data, error } = await adminClient
    .from('knowledge_base')
    .insert({
      company_id: req.companyId,
      title,
      content,
      category,
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

  scheduleKnowledgeIndexing(data.id, req.companyId!);

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'knowledge_created',
    entityType: 'knowledge_base',
    entityId: data.id,
    metadata: { char_count: charCount },
  });

  res.status(201).json({ success: true, data });
}

export async function updateKnowledgeItem(req: AuthRequest, res: Response): Promise<void> {
  const id = paramId(req.params.id);
  const { title, content, category, is_active, source_filename } = req.body;
  const charCount = typeof content === 'string' ? content.length : undefined;

  const { data, error } = await adminClient
    .from('knowledge_base')
    .update({
      title,
      content,
      category,
      is_active,
      ...(source_filename !== undefined ? { source_filename } : {}),
      ...(charCount !== undefined ? { char_count: charCount } : {}),
      index_status: 'pending',
      index_error: null,
    })
    .eq('id', id)
    .eq('company_id', req.companyId)
    .select()
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  scheduleKnowledgeIndexing(data.id, req.companyId!);

  res.json({ success: true, data });
}

export async function deleteKnowledgeItem(req: AuthRequest, res: Response): Promise<void> {
  const id = paramId(req.params.id);
  const { error } = await adminClient
    .from('knowledge_base')
    .delete()
    .eq('id', id)
    .eq('company_id', req.companyId);

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, message: 'Bilgi silindi' });
}

export async function parseKnowledgeFile(req: AuthRequest, res: Response): Promise<void> {
  const file = req.file;

  if (!file) {
    res.status(400).json({ success: false, error: 'Lütfen bir dosya seçin' });
    return;
  }

  try {
    const parsed = await parseKnowledgeDocument(file.buffer, file.originalname);

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
