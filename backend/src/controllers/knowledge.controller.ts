/**
 * Knowledge base controller
 */

import { Response } from 'express';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../services/log.service';

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
