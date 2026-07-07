/**
 * Referans logoları controller — admin yönetimi + herkese açık listeleme
 */

import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { adminClient } from '../database/supabase';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../services/log.service';
import {
  uploadReferenceLogoFile,
  deleteReferenceLogoFiles,
} from '../services/reference-logo.service';

const TABLE = 'reference_logos';

export async function adminListReferenceLogos(_req: AuthRequest, res: Response): Promise<void> {
  const { data, error } = await adminClient
    .from(TABLE)
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data });
}

export async function createReferenceLogo(req: AuthRequest, res: Response): Promise<void> {
  const file = req.file;
  const name = String(req.body?.name || '').trim();
  const website = String(req.body?.website || '').trim() || null;

  if (!name) {
    res.status(400).json({ success: false, error: 'Logo adı gerekli' });
    return;
  }
  if (!file?.buffer?.length) {
    res.status(400).json({ success: false, error: 'Logo dosyası gerekli' });
    return;
  }

  const id = randomUUID();

  try {
    const logoUrl = await uploadReferenceLogoFile(id, file.buffer, file.mimetype, file.originalname);

    const { data: maxRow } = await adminClient
      .from(TABLE)
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (maxRow?.display_order ?? 0) + 1;

    const { data, error } = await adminClient
      .from(TABLE)
      .insert({ id, name, website, logo_url: logoUrl, display_order: nextOrder })
      .select()
      .single();

    if (error) {
      await deleteReferenceLogoFiles(id);
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    await logActivity({
      userId: req.userId,
      action: 'reference_logo_created',
      entityType: 'reference_logo',
      entityId: id,
    });

    res.json({ success: true, data });
  } catch (err) {
    await deleteReferenceLogoFiles(id);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Logo yüklenemedi',
    });
  }
}

export async function updateReferenceLogo(req: AuthRequest, res: Response): Promise<void> {
  const id = String(req.params.id);
  const payload: Record<string, unknown> = {};

  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) {
      res.status(400).json({ success: false, error: 'Logo adı boş olamaz' });
      return;
    }
    payload.name = name;
  }
  if (req.body?.website !== undefined) {
    payload.website = String(req.body.website).trim() || null;
  }
  if (req.body?.is_active !== undefined) {
    payload.is_active = Boolean(req.body.is_active);
  }
  if (req.body?.display_order !== undefined) {
    payload.display_order = Number(req.body.display_order) || 0;
  }

  if (Object.keys(payload).length === 0) {
    res.status(400).json({ success: false, error: 'Güncellenecek alan yok' });
    return;
  }

  const { data, error } = await adminClient
    .from(TABLE)
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  res.json({ success: true, data });
}

export async function deleteReferenceLogo(req: AuthRequest, res: Response): Promise<void> {
  const id = String(req.params.id);

  const { error } = await adminClient.from(TABLE).delete().eq('id', id);
  if (error) {
    res.status(400).json({ success: false, error: error.message });
    return;
  }

  await deleteReferenceLogoFiles(id);

  await logActivity({
    userId: req.userId,
    action: 'reference_logo_deleted',
    entityType: 'reference_logo',
    entityId: id,
  });

  res.json({ success: true, data: { id } });
}

/**
 * Herkese açık — yalnızca aktif logolar (tanıtım sayfası için).
 */
export async function getPublicReferenceLogos(_req: Request, res: Response): Promise<void> {
  const { data, error } = await adminClient
    .from(TABLE)
    .select('id, name, logo_url, website, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    res.json({ success: true, data: [] });
    return;
  }

  res.json({ success: true, data: data ?? [] });
}
