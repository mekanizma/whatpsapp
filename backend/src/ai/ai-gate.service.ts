/**
 * AI ön filtre — OpenAI çağrısı öncesi gereksiz API tüketimini engeller
 * Kredi optimizasyonu: şablon cevap, transfer algılama, spam filtresi
 */

export interface GateResult {
  skipAI: boolean;
  response?: string;
  shouldTransfer?: boolean;
  reason: string;
}

const GREETING_PATTERNS = /^(merhaba|selam|slm|hey|hi|hello|günaydın|iyi günler|tünaydın|sa|mrb|mraba)[\s!.?]*$/i;
const THANKS_PATTERNS = /^(teşekkür|tesekkur|sağol|sagol|eyvallah|thanks|thx)[\s!.?]*$/i;
const TRANSFER_PATTERNS = /insan|temsilci|operatör|operator|canlı destek|yetkili|müşteri temsilci|gerçek kişi|biriyle görüş/i;
const SPAM_PATTERNS = /^(.)\1{4,}$/; // aaaaa

const TEMPLATES = {
  greeting: 'Merhaba! Size nasıl yardımcı olabilirim?',
  thanks: 'Rica ederiz! Başka bir sorunuz olursa yazabilirsiniz.',
  transfer: 'Size müşteri temsilcimizi bağlıyorum. Lütfen kısa bir süre bekleyin.',
  quotaExceeded: 'Mesaj limitinize ulaşıldı. Lütfen daha sonra tekrar deneyin veya yöneticinizle iletişime geçin.',
  tooShort: 'Mesajınızı anlayamadım. Lütfen sorunuzu biraz daha detaylı yazın.',
};

export function preAIGate(message: string): GateResult {
  const trimmed = message.trim();

  if (!trimmed || trimmed.length < 2) {
    return { skipAI: true, response: TEMPLATES.tooShort, reason: 'too_short' };
  }

  if (SPAM_PATTERNS.test(trimmed)) {
    return { skipAI: true, response: TEMPLATES.tooShort, reason: 'spam' };
  }

  if (GREETING_PATTERNS.test(trimmed)) {
    return { skipAI: true, response: TEMPLATES.greeting, reason: 'greeting_template' };
  }

  if (THANKS_PATTERNS.test(trimmed)) {
    return { skipAI: true, response: TEMPLATES.thanks, reason: 'thanks_template' };
  }

  if (TRANSFER_PATTERNS.test(trimmed)) {
    return {
      skipAI: true,
      response: TEMPLATES.transfer,
      shouldTransfer: true,
      reason: 'transfer_keyword',
    };
  }

  return { skipAI: false, reason: 'needs_ai' };
}

export const TRANSFER_REPLY_MESSAGE = TEMPLATES.transfer;

export function normalizeForCache(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\wğüşıöçĞÜŞİÖÇ\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}
