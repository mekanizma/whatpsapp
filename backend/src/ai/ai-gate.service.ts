/**
 * AI ön filtre — OpenAI çağrısı öncesi gereksiz API tüketimini engeller
 * Kredi optimizasyonu: şablon cevap, transfer algılama, spam filtresi
 */

import { detectImmediateEscalation } from './conversation-escalation.service';

export interface GateResult {
  skipAI: boolean;
  response?: string;
  shouldTransfer?: boolean;
  reason: string;
}

const GREETING_PATTERNS = /^(merhaba|selam|slm|hey|hi|hello|günaydın|iyi günler|tünaydın|sa|mrb|mraba)[\s!.?]*$/i;
const THANKS_PATTERNS = /^(teşekkür|tesekkur|sağol|sagol|eyvallah|thanks|thx)[\s!.?]*$/i;
const SPAM_PATTERNS = /^(.)\1{4,}$/;

export function normalizeForGate(text: string): string {
  return text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .replace(/ı/g, 'i')
    .toLowerCase();
}

const TEMPLATES = {
  greeting:
    'Merhaba, ben AI destek asistanıyım. Bilgi bankamızdaki konularda size yardımcı olabilirim.',
  thanks: 'Rica ederiz! Başka bir sorunuz olursa yazabilirsiniz.',
  tooShort: 'Mesajınızı anlayamadım. Lütfen sorunuzu biraz daha detaylı yazın.',
  humanTransfer:
    'Elbette. Sizi temsilciye aktarıyorum. Talebinizi doğru yönlendirebilmem için konuyu kısaca yazar mısınız?',
  payment:
    'Ödeme konularında güvenliğiniz için kart veya şifre bilgisi paylaşmayın. Bu konuda sizi temsilciye aktarabilirim. Başka bir sorunuz varsa yardımcı olmaya devam edebilirim.',
  refund:
    'İade işlemleri talep detayına göre kontrol edilmelidir. Sizi temsilciye aktarabilirim. Başka bir konuda yardımcı olabilirim.',
  optOut:
    'Talebiniz alındı. Size tekrar bilgilendirme mesajı gönderilmemesi için gerekli kayıt oluşturulacaktır.',
  sensitiveData:
    'Güvenliğiniz için bu tür bilgileri WhatsApp üzerinden paylaşmayın. Bu konu için sizi temsilciye aktarabilirim.',
  promptInjection:
    'Bu bilgiyi paylaşamam. Güvenlik ve gizlilik nedeniyle bu tür taleplere yardımcı olamam. İsterseniz talebinizi temsilciye aktarabilirim.',
  complaint:
    'Yaşadığınız durum için üzgünüm. Sizi temsilciye aktarabilirim. İsterseniz başka bir konuda da yardımcı olabilirim.',
};

const HUMAN_TRANSFER_PATTERNS = [
  /canli destek/,
  /canliya (bagla|aktar|yonlendir)/,
  /musteri hizmetleri/,
  /musteri temsilci(sine|si|ye)?/,
  /temsilci(ye|yi)? (bagla|aktar|istiyorum)/,
  /yetkili(ye|yi)? (bagla|istiyorum|gorus)/,
  /operator (istiyorum|ile|le|a|e)/,
  /insan(la| ile) (konus|gorus)/,
  /gercek (insan|kisi|biri)/,
  /biriyle gorusmek istiyorum/,
  /temsilci istiyorum/,
  /baglar misiniz/,
  /baglayin/,
];

const PAYMENT_PATTERNS =
  /odeme|fatura|dekont|para transfer|havale|eft|iban|kart numara|cvv|sifre|hesap islem/;
const REFUND_PATTERNS = /iade|geri odeme|iptal et|para iadesi/;
const COMPLAINT_PATTERNS =
  /sikayet|memnun degil|kotu hizmet|berbat|rezalet/;
const OPT_OUT_PATTERNS =
  /^(stop|dur|iptal|unsubscribe|mesaj almak istemiyorum|verilerimi sil|beni sil)[\s!.?]*$/;
const SENSITIVE_DATA_PATTERNS =
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b|\bcvv\b|\b\d{3,4}\s*cvv\b|\bapi\s*key\b/i;
const PROMPT_INJECTION_PATTERNS =
  /sistem prompt|kurallari unut|onceki kurallar|admin sifre|api key.*ver|veritabanini goster|sql sorgu|gizli talimat|olusturan kurallar/;

const TRANSFER_CONFIRM_PATTERNS = [
  /^evet\b/,
  /^tamam\b/,
  /temsilci(ye|yi)?\s*(aktar|bagla)/,
  /aktar(in|ın|abilirsiniz)?$/,
  /bagla(r|yın|yin)\b/,
  /canliya\s*(aktar|bagla)/,
];

function confirmsTransferAfterOffer(
  normalized: string,
  history: { sender_type: string; message: string }[]
): boolean {
  if (!TRANSFER_CONFIRM_PATTERNS.some((p) => p.test(normalized))) return false;
  const lastAi = [...history].reverse().find((m) => m.sender_type === 'ai');
  if (!lastAi) return false;
  const aiNorm = normalizeForGate(lastAi.message);
  return /aktarabilirim|temsilci|canli destek|bagliyorum/.test(aiNorm);
}

function wantsHumanTransfer(normalized: string): boolean {
  return HUMAN_TRANSFER_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function preAIGate(
  message: string,
  history: { sender_type: string; message: string }[] = []
): GateResult {
  const trimmed = message.trim();
  const normalized = normalizeForGate(trimmed);

  if (!trimmed || trimmed.length < 2) {
    return { skipAI: true, response: TEMPLATES.tooShort, reason: 'too_short' };
  }

  if (SPAM_PATTERNS.test(trimmed)) {
    return { skipAI: true, response: TEMPLATES.tooShort, reason: 'spam' };
  }

  const frustration = detectImmediateEscalation(trimmed);
  if (frustration.escalate && frustration.response) {
    return {
      skipAI: true,
      shouldTransfer: frustration.shouldTransfer,
      response: frustration.response,
      reason: frustration.reason,
    };
  }

  if (PROMPT_INJECTION_PATTERNS.test(normalized)) {
    return {
      skipAI: true,
      response: TEMPLATES.promptInjection,
      shouldTransfer: true,
      reason: 'prompt_injection',
    };
  }

  if (SENSITIVE_DATA_PATTERNS.test(trimmed)) {
    return {
      skipAI: true,
      response: TEMPLATES.sensitiveData,
      shouldTransfer: true,
      reason: 'sensitive_data',
    };
  }

  if (OPT_OUT_PATTERNS.test(normalized)) {
    return {
      skipAI: true,
      response: TEMPLATES.optOut,
      shouldTransfer: true,
      reason: 'opt_out',
    };
  }

  if (wantsHumanTransfer(normalized)) {
    return {
      skipAI: true,
      shouldTransfer: true,
      response: TEMPLATES.humanTransfer,
      reason: 'human_transfer_request',
    };
  }

  if (confirmsTransferAfterOffer(normalized, history)) {
    return {
      skipAI: true,
      shouldTransfer: true,
      response: TEMPLATES.humanTransfer,
      reason: 'transfer_confirmed',
    };
  }

  if (COMPLAINT_PATTERNS.test(normalized)) {
    return {
      skipAI: true,
      shouldTransfer: false,
      response: TEMPLATES.complaint,
      reason: 'complaint',
    };
  }

  if (PAYMENT_PATTERNS.test(normalized)) {
    return {
      skipAI: true,
      shouldTransfer: false,
      response: TEMPLATES.payment,
      reason: 'payment_inquiry',
    };
  }

  if (REFUND_PATTERNS.test(normalized)) {
    return {
      skipAI: true,
      shouldTransfer: false,
      response: TEMPLATES.refund,
      reason: 'refund_inquiry',
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
