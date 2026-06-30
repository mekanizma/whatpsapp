/**
 * Knowledge base controller
 */

import { Response } from 'express';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../services/log.service';
import { parseKnowledgeDocument } from '../services/document-parser.service';

export async function getKnowledgeItems(req: AuthRequest, res: Response): Promise<void> {
  if (config.demoMode) {
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
  const { title, content, category } = req.body;

  const { data, error } = await adminClient
    .from('knowledge_base')
    .insert({ company_id: req.companyId, title, content, category })
    .select()
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await logActivity({
    userId: req.userId,
    companyId: req.companyId,
    action: 'knowledge_created',
    entityType: 'knowledge_base',
    entityId: data.id,
  });

  res.status(201).json({ success: true, data });
}

export async function updateKnowledgeItem(req: AuthRequest, res: Response): Promise<void> {
  const { title, content, category, is_active } = req.body;

  const { data, error } = await adminClient
    .from('knowledge_base')
    .update({ title, content, category, is_active })
    .eq('id', req.params.id)
    .eq('company_id', req.companyId)
    .select()
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data });
}

export async function deleteKnowledgeItem(req: AuthRequest, res: Response): Promise<void> {
  const { error } = await adminClient
    .from('knowledge_base')
    .delete()
    .eq('id', req.params.id)
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
      },
    });

    res.json({ success: true, data: parsed });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
}
