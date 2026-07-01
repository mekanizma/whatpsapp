/**
 * Bilinmeyen sorular controller
 */

import { Response } from 'express';
import { AuthRequest, isDemoSession } from '../middleware/auth.middleware';
import { planHasModule } from '../services/plan-capabilities.service';
import {
  listUnknownQuestions,
  updateUnknownQuestion,
  companyCanUseUnknownQuestions,
  type UnknownQuestionStatus,
} from '../services/unknown-questions.service';
import { demoUnknownQuestions, demoCompany } from '../demo/mockData';
import type { UnknownQuestionRow } from '../services/unknown-questions.service';

async function requireUnknownQuestionsModule(req: AuthRequest, res: Response): Promise<boolean> {
  const allowed = isDemoSession(req)
    ? planHasModule(demoCompany.subscription_plan, 'unknown_questions')
    : await companyCanUseUnknownQuestions(req.companyId!);

  if (!allowed) {
    res.status(403).json({
      success: false,
      error: 'Bu özellik Business ve Enterprise paketlerinde kullanılabilir.',
    });
    return false;
  }
  return true;
}

export async function getUnknownQuestions(req: AuthRequest, res: Response): Promise<void> {
  if (!(await requireUnknownQuestionsModule(req, res))) return;

  if (isDemoSession(req)) {
    res.json({ success: true, data: demoUnknownQuestions });
    return;
  }

  const status = req.query.status as UnknownQuestionStatus | undefined;
  const validStatuses = ['open', 'resolved', 'dismissed', 'added_to_kb'];
  const filter = status && validStatuses.includes(status) ? status : undefined;

  try {
    const data = await listUnknownQuestions(req.companyId!, filter);
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen sorular yüklenemedi';
    res.status(400).json({ success: false, error: message });
  }
}

export async function patchUnknownQuestion(req: AuthRequest, res: Response): Promise<void> {
  if (!(await requireUnknownQuestionsModule(req, res))) return;

  if (req.role !== 'company_admin') {
    res.status(403).json({ success: false, error: 'Yalnızca şirket yöneticisi güncelleyebilir.' });
    return;
  }

  if (isDemoSession(req)) {
    const id = String(req.params.id);
    const { status } = req.body as { status?: UnknownQuestionStatus };
    const item = demoUnknownQuestions.find((q) => q.id === id) as UnknownQuestionRow | undefined;
    if (!item) {
      res.status(404).json({ success: false, error: 'Kayıt bulunamadı' });
      return;
    }
    if (status) item.status = status;
    item.updated_at = new Date().toISOString();
    res.json({ success: true, data: item });
    return;
  }

  const { status } = req.body as { status?: UnknownQuestionStatus };
  const validStatuses = ['open', 'resolved', 'dismissed', 'added_to_kb'];
  if (status && !validStatuses.includes(status)) {
    res.status(400).json({ success: false, error: 'Geçersiz durum' });
    return;
  }

  try {
    const data = await updateUnknownQuestion(req.companyId!, String(req.params.id), { status });
    res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Güncelleme başarısız';
    res.status(400).json({ success: false, error: message });
  }
}
