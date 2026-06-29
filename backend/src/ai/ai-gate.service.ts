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
const SPAM_PATTERNS = /^(.)\1{4,}$/; // aaaaa

const TEMPLATES = {
  greeting: 'Merhaba! Size nasıl yardımcı olabilirim?',
  thanks: 'Rica ederiz! Başka bir sorunuz olursa yazabilirsiniz.',
  tooShort: 'Mesajınızı anlayamadım. Lütfen sorunuzu biraz daha detaylı yazın.',
  humanTransfer:
    'Sizi müşteri temsilcimize bağlıyorum. Kısa süre içinde bir temsilcimiz size dönüş yapacaktır. Lütfen bekleyiniz.',
};

/** Canlı temsilci / gerçek insan talebi algılama */
const HUMAN_TRANSFER_PATTERNS = [
  /canlı\s*destek/i,
  /canlıya\s*(bağla|aktar|yönlendir)/i,
  /canlı\s*(birine|kişiye)\s*bağla/i,
  /canlı\s*biri/i,
  /gerçek\s*(insan|kişi|biri)/i,
  /gerçek\s*biriyle\s*görüş/i,
  /müşteri\s*temsilci(sine|si|ye)?\s*(bağla|yönlendir)/i,
  /temsilci(ye|ye)?\s*bağla/i,
  /operatör\s*(istiyorum|ile|le|a|e)/i,
  /insan(la|la| ile)\s*(konuş|görüş)/i,
  /(birine|birisine)\s*bağla/i,
  /yapay\s*zeka\s*değil/i,
  /robot\s*değil/i,
  /insan\s*istiyorum/i,
  /temsilci\s*istiyorum/i,
  /bağlar\s*mısınız/i,
  /bağlayın/i,
  /görüşmek\s*istiyorum/i,
  /gerçek\s*(insan|kişi|biri)(ya|a|yle)?\s*(bağla|görüş)/i,
  /canlı\s*(biri|kişi)(yle|yla| ile)\s*(görüş|konuş)/i,
];

const HUMAN_TRANSFER_HINTS = /temsilci|canlı|operatör|insanla|insan ile/i;
const HUMAN_TRANSFER_ACTIONS = /bağla|aktar|yönlendir|görüş|konuş|istiyorum|geçir|ver|ulaş/i;

function wantsHumanTransfer(message: string): boolean {
  if (HUMAN_TRANSFER_PATTERNS.some((pattern) => pattern.test(message))) {
    return true;
  }
  return HUMAN_TRANSFER_HINTS.test(message) && HUMAN_TRANSFER_ACTIONS.test(message);
}

export function preAIGate(message: string): GateResult {
  const trimmed = message.trim();

  if (!trimmed || trimmed.length < 2) {
    return { skipAI: true, response: TEMPLATES.tooShort, reason: 'too_short' };
  }

  if (SPAM_PATTERNS.test(trimmed)) {
    return { skipAI: true, response: TEMPLATES.tooShort, reason: 'spam' };
  }

  if (wantsHumanTransfer(trimmed)) {
    return {
      skipAI: true,
      shouldTransfer: true,
      response: TEMPLATES.humanTransfer,
      reason: 'human_transfer_request',
    };
  }

  if (GREETING_PATTERNS.test(trimmed)) {
    return { skipAI: true, response: TEMPLATES.greeting, reason: 'greeting_template' };
  }

  if (THANKS_PATTERNS.test(trimmed)) {
    return { skipAI: true, response: TEMPLATES.thanks, reason: 'thanks_template' };
  }

  return { skipAI: false, reason: 'needs_ai' };
}

export function normalizeForCache(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\wğüşıöçĞÜŞİÖÇ\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}
