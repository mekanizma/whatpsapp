/**
 * Bilgi bankası dışı soru algılama — AI yanıtından KB eksikliği tespiti
 */

import { normalizeForGate } from './ai-gate.service';
import { isKnowledgeQuestion } from './knowledge-filter.service';

const KNOWLEDGE_MISS_PATTERNS = [
  /bilgi bankamizda kayit bulunmuyor/,
  /bilgi bankamiz henuz hazir degil/,
  /bilgi bankamizda bu konu/,
  /bu konuda bilgi bankamizda/,
  /net bilgiye ulasamadim/,
  /net bilgi bulamadim/,
  /yanlis yonlendirmemek icin/,
  /bilgi bankasinda (yok|bulunmuyor|mevcut degil)/,
  /could not find (clear )?information/,
  /not in (our |the )?knowledge base/,
  /don't have (that |this )?information/,
  /do not have (that |this )?information/,
  /no information (in|on|about)/,
  /avoid misguiding you/,
];

export function isKnowledgeMissAiResponse(response: string): boolean {
  const normalized = normalizeForGate(response.trim());
  if (!normalized) return false;
  return KNOWLEDGE_MISS_PATTERNS.some((p) => p.test(normalized));
}

export interface UnknownQuestionContext {
  customerMessage: string;
  aiResponse: string;
  shouldTransfer: boolean;
  skippedAI: boolean;
  skipReason?: string;
  appointmentMode: boolean;
}

/** Bilinmeyen soru kaydı gerekip gerekmediğini belirler */
export function shouldRecordUnknownQuestion(ctx: UnknownQuestionContext): boolean {
  if (ctx.skippedAI || ctx.shouldTransfer || ctx.appointmentMode) return false;
  if (!ctx.aiResponse.trim()) return false;

  if (isKnowledgeMissAiResponse(ctx.aiResponse)) return true;

  if (isKnowledgeQuestion(ctx.customerMessage) && isKnowledgeMissAiResponse(ctx.aiResponse)) {
    return true;
  }

  return false;
}

export function normalizeQuestionText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 500);
}
