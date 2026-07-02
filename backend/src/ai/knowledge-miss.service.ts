/**
 * Bilgi bankası dışı soru algılama — AI yanıtından KB eksikliği tespiti
 */

import { normalizeForGate } from './ai-gate.service';
import { isKnowledgeQuestion } from './knowledge-filter.service';

/** AI'ın bilgi bankasında cevap bulamadığını gösteren yanıt kalıpları (normalize edilmiş metin) */
const KNOWLEDGE_MISS_PATTERNS = [
  /bilgi bankamizda kayit bulunmuyor/,
  /bilgi bankamiz henuz hazir degil/,
  /bilgi bankamizda bu konu/,
  /bu konuda bilgi bankamizda/,
  /net bilgiye ulasamadim/,
  /net bilgi bulamadim/,
  /yanlis yonlendirmemek icin/,
  /bilgi bankasinda (yok|bulunmuyor|mevcut degil)/,
  /bilgiye sahip degilim/,
  /bu konuda bilgiye sahip degilim/,
  /bu konu hakkinda bilgiye sahip degilim/,
  /bu konuda bilgim( yok| bulunmuyor| mevcut degil)/,
  /bu konu hakkinda bilgim( yok| bulunmuyor)/,
  /bilgim(iz)? (yok|bulunmuyor|mevcut degil)/,
  /bu konuda (net )?bilgi(m)? (yok|bulunmuyor|mevcut degil)/,
  /maalesef bu konuda/,
  /malesef bu konuda/,
  /bu bilgi(ye)? (sahip degilim|ulasamadim|bulamadim)/,
  /could not find (clear )?information/,
  /not in (our |the )?knowledge base/,
  /don't have (that |this |any )?information/,
  /do not have (that |this |any )?information/,
  /i don't have (that |this |any )?information/,
  /i do not have (that |this |any )?information/,
  /no information (in|on|about|regarding)/,
  /avoid misguiding you/,
  /pas d'informations/,
  /je n'ai pas d'informations/,
  /keine information(en)? (zu|uber|hierzu)/,
  /no tengo informacion/,
  /no dispongo de informacion/,
];

/** KB miss sonrası temsilci teklifi — tek başına yeterli değil, bilgi yok ifadesiyle birlikte */
const KB_MISS_TRANSFER_OFFER_PATTERNS = [
  /baska bir konuda yardimci olabilir.*temsilci/,
  /basinda bir konuda yardimci olabilir.*temsilci/,
  /temsilci(ye| ile)? (bagla|aktar|baglayayim)/,
  /canli (destek|temsilci).*(bagla|aktar|ister)/,
  /would you like.*(representative|live agent|human)/,
  /souhaitez.*representant/,
];

export function isKnowledgeMissAiResponse(response: string): boolean {
  const normalized = normalizeForGate(response.trim());
  if (!normalized) return false;

  if (KNOWLEDGE_MISS_PATTERNS.some((p) => p.test(normalized))) {
    return true;
  }

  const hasMissSignal =
    /bilgiye sahip degilim|bilgim( yok| bulunmuyor)|bilgimiz (yok|bulunmuyor)/.test(normalized);
  const hasTransferOffer = KB_MISS_TRANSFER_OFFER_PATTERNS.some((p) => p.test(normalized));

  return hasMissSignal && hasTransferOffer;
}

export interface UnknownQuestionContext {
  customerMessage: string;
  aiResponse: string;
  shouldTransfer: boolean;
  skippedAI: boolean;
  skipReason?: string;
  appointmentMode: boolean;
  /** RAG indeks hazır ama soruya uygun chunk bulunamadı */
  kbHasNoMatch?: boolean;
}

/** Bilinmeyen soru kaydı gerekip gerekmediğini belirler */
export function shouldRecordUnknownQuestion(ctx: UnknownQuestionContext): boolean {
  if (ctx.skippedAI || ctx.shouldTransfer || ctx.appointmentMode) return false;
  if (!ctx.aiResponse.trim()) return false;

  if (isKnowledgeMissAiResponse(ctx.aiResponse)) return true;

  if (
    ctx.kbHasNoMatch &&
    isKnowledgeQuestion(ctx.customerMessage) &&
    isKnowledgeMissAiResponse(ctx.aiResponse)
  ) {
    return true;
  }

  return false;
}

export function normalizeQuestionText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 500);
}
