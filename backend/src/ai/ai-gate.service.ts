/**
 * AI ön filtre — OpenAI çağrısı öncesi gereksiz API tüketimini engeller
 * Kredi optimizasyonu: şablon cevap, transfer algılama, spam filtresi
 */

import { detectImmediateEscalation } from './conversation-escalation.service';
import { ConversationLang, detectConversationLanguage, t } from './language.service';

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

const HUMAN_TRANSFER_PATTERNS = [
  /canli destek/,
  /canli (biri|kisi|temsilci)/,
  /canliya (bagla|aktar|yonlendir)/,
  /musteri hizmetleri/,
  /musteri temsilci(sine|si|ye)?/,
  /temsilci(ye|yi|sine|sini)?(\s|$)/,
  /temsilci(ye|yi)?\s*(bagla|aktar|istiyorum|ulas)/,
  /yetkili(ye|yi)?(\s|$)/,
  /yetkili(ye|yi)? (bagla|istiyorum|gorus)/,
  /operator (istiyorum|ile|le|a|e)/,
  /insan(la| ile)?\s*(konus|gorus)/,
  /insan\s+istiyorum/,
  /gercek (insan|kisi|biri)/,
  /biriyle gorusmek istiyorum/,
  /gorusmek istiyorum.*(insan|temsilci|yetkili)/,
  /temsilci istiyorum/,
  /baglar misiniz/,
  /baglayin/,
  /bagla(r)?\s*(misiniz|mısınız|lutfen|lütfen)?/,
  /aktar(ir|in|abilir)?\s*(misiniz|mısınız|lutfen)?/,
  /live (agent|support|representative|person)/,
  /human (agent|support|representative)/,
  /real (person|human|agent)/,
  /speak (to|with) (a |an )?(real |live )?(person|agent|human|representative)/,
  /talk to (someone|a person|an agent|a human)/,
  /connect me (to|with)/,
  /transfer me (to|to a)/,
  /customer (service|support)/,
  /representative (please|now)/,
  /i want (a |an )?(human|agent|representative)/,
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
  /^olur\b/,
  /^tabii\b/,
  /^peki\b/,
  /^isterim\b/,
  /^lutfen\b/,
  /^yes\b/,
  /^ok\b/,
  /^okay\b/,
  /^sure\b/,
  /^please\b/,
  /temsilci(ye|yi)?\s*(aktar|bagla)/,
  /aktar(in|ın|abilirsiniz|ir misiniz)?$/,
  /bagla(r|yın|yin|misiniz)?\b/,
  /canliya\s*(aktar|bagla)/,
  /baglamani\s*isterim/,
  /transfer (me|please)/,
  /connect (me|please)/,
  /go ahead/,
];

const AI_TRANSFER_OFFER_PATTERNS =
  /aktarabilirim|temsilci|canli destek|canli temsilci|bagliyorum|baglamam[iı] ister|transfer you|representative|live support|live agent|connect you|weiterleiten|transférer|transfere|knowledge base.*(connect|transfer|temsilci)/i;

function confirmsTransferAfterOffer(
  normalized: string,
  history: { sender_type: string; message: string }[]
): boolean {
  if (!TRANSFER_CONFIRM_PATTERNS.some((p) => p.test(normalized))) return false;
  const lastAi = [...history].reverse().find((m) => m.sender_type === 'ai');
  if (!lastAi) return false;
  const aiNorm = normalizeForGate(lastAi.message);
  return AI_TRANSFER_OFFER_PATTERNS.test(aiNorm);
}

function wantsHumanTransfer(normalized: string): boolean {
  return HUMAN_TRANSFER_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isGreetingMessage(message: string): boolean {
  return GREETING_PATTERNS.test(message.trim());
}

export function preAIGate(
  message: string,
  history: { sender_type: string; message: string }[] = [],
  lang?: ConversationLang
): GateResult {
  const trimmed = message.trim();
  const normalized = normalizeForGate(trimmed);
  const conversationLang = lang ?? detectConversationLanguage(trimmed, history);

  if (!trimmed || trimmed.length < 2) {
    return { skipAI: true, response: t(conversationLang, 'too_short'), reason: 'too_short' };
  }

  if (SPAM_PATTERNS.test(trimmed)) {
    return { skipAI: true, response: t(conversationLang, 'too_short'), reason: 'spam' };
  }

  const frustration = detectImmediateEscalation(trimmed, conversationLang);
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
      response: t(conversationLang, 'prompt_injection'),
      shouldTransfer: true,
      reason: 'prompt_injection',
    };
  }

  if (SENSITIVE_DATA_PATTERNS.test(trimmed)) {
    return {
      skipAI: true,
      response: t(conversationLang, 'sensitive_data'),
      shouldTransfer: true,
      reason: 'sensitive_data',
    };
  }

  if (OPT_OUT_PATTERNS.test(normalized)) {
    return {
      skipAI: true,
      response: t(conversationLang, 'opt_out'),
      shouldTransfer: true,
      reason: 'opt_out',
    };
  }

  if (confirmsTransferAfterOffer(normalized, history)) {
    return {
      skipAI: true,
      shouldTransfer: true,
      response: t(conversationLang, 'human_transfer'),
      reason: 'transfer_confirmed',
    };
  }

  if (wantsHumanTransfer(normalized)) {
    return {
      skipAI: true,
      shouldTransfer: true,
      response: t(conversationLang, 'human_transfer'),
      reason: 'human_transfer_request',
    };
  }

  if (COMPLAINT_PATTERNS.test(normalized)) {
    return {
      skipAI: true,
      shouldTransfer: false,
      response: t(conversationLang, 'complaint'),
      reason: 'complaint',
    };
  }

  if (PAYMENT_PATTERNS.test(normalized)) {
    return {
      skipAI: true,
      shouldTransfer: false,
      response: t(conversationLang, 'payment'),
      reason: 'payment_inquiry',
    };
  }

  if (REFUND_PATTERNS.test(normalized)) {
    return {
      skipAI: true,
      shouldTransfer: false,
      response: t(conversationLang, 'refund'),
      reason: 'refund_inquiry',
    };
  }

  if (GREETING_PATTERNS.test(trimmed)) {
    return { skipAI: true, response: t(conversationLang, 'greeting'), reason: 'greeting_template' };
  }

  if (THANKS_PATTERNS.test(trimmed)) {
    return { skipAI: true, response: t(conversationLang, 'thanks'), reason: 'thanks_template' };
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
