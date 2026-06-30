/**
 * Kızgınlık ve tekrarlayan cevapsızlık — canlı temsilciye yükseltme
 */

import { normalizeForGate } from './ai-gate.service';
import { ConversationLang, detectConversationLanguage, t } from './language.service';

export interface ConversationMessage {
  sender_type: string;
  message: string;
}

export interface EscalationResult {
  escalate: boolean;
  /** true yalnızca müşteri açıkça istediğinde veya ciddi kızgınlıkta */
  shouldTransfer: boolean;
  reason: string;
  response?: string;
}

export function getTransferOfferMsg(lang: ConversationLang = 'tr'): string {
  return t(lang, 'transfer_offer');
}

/** Geriye dönük uyumluluk — varsayılan Türkçe */
export const TRANSFER_OFFER_MSG = getTransferOfferMsg('tr');

const FRUSTRATION_PATTERNS = [
  /kizgin|sinirliyim|sinir oldum|cildirdim|cildir/,
  /biktim|yeter( artik)?|sabrim tas/,
  /sacma|anlamiyorsun|anlamadin|aptal|salak/,
  /robot|bot(sun)?|insan (istiyorum|bagla)/,
  /berbat|rezalet|kotu hizmet|igrenc/,
  /yardimci olmuyor|cevap vermiyor|bos (konusuyor|yapiyor)/,
  /yanlis (bilgi|cevap)|hala ayni|tekrar( ediyor)?/,
  /begenmedim|ise yaramiyor|faydasi yok/,
  /ne sacmalik|dalga mi geciyor|oynuyor musun/,
  /sikayet( etmek)? istiyorum/,
];

const DISSATISFACTION_PATTERNS = [
  /yanlis(soyluyor)?|dogru degil|oyle degil/,
  /bunu sormadim|baska soru/,
  /anlamadin|anlamiyorsun/,
  /cozum( sun)?(muyor)?|yardim etmiyor/,
];

const AI_UNHELPFUL_PATTERNS = [
  /bilgi bankamizda kayit bulunmuyor/,
  /bilgi bankamiz henuz hazir degil/,
  /net bilgiye ulasamadim/,
  /yanlis yonlendirmemek icin/,
  /temsilciye aktarabilirim/,
  /could not find clear information/,
  /transfer you to a representative/,
  /avoid misguiding you/,
];


function countUnhelpfulAiReplies(history: ConversationMessage[]): number {
  return history
    .slice(-10)
    .filter(
      (m) =>
        m.sender_type === 'ai' &&
        AI_UNHELPFUL_PATTERNS.some((p) => p.test(normalizeForGate(m.message)))
    ).length;
}

/** Mevcut mesajda kızgınlık — canlı destek (açık talep) */
export function detectImmediateEscalation(
  message: string,
  lang: ConversationLang = 'tr'
): EscalationResult {
  const normalized = normalizeForGate(message.trim());

  if (FRUSTRATION_PATTERNS.some((p) => p.test(normalized))) {
    return {
      escalate: true,
      shouldTransfer: true,
      reason: 'customer_frustration',
      response: t(lang, 'frustration'),
    };
  }

  return { escalate: false, shouldTransfer: false, reason: '' };
}

/** Konuşma geçmişine göre tekrarlayan cevapsızlık — yumuşak teklif, otomatik aktarım yok */
export function detectConversationEscalation(
  message: string,
  history: ConversationMessage[],
  kbWillFail: boolean,
  lang?: ConversationLang
): EscalationResult {
  const conversationLang = lang ?? detectConversationLanguage(message, history);
  const immediate = detectImmediateEscalation(message, conversationLang);
  if (immediate.escalate) return immediate;

  const transferOffer = getTransferOfferMsg(conversationLang);

  // Memnuniyetsizlik → yumuşak teklif, cevap vermeye devam
  const normalized = normalizeForGate(message.trim());
  if (DISSATISFACTION_PATTERNS.some((p) => p.test(normalized))) {
    return {
      escalate: true,
      shouldTransfer: false,
      reason: 'customer_dissatisfaction',
      response: transferOffer,
    };
  }

  const unhelpfulCount = countUnhelpfulAiReplies(history);

  // KB'de yok → yumuşak temsilci teklifi (ticket açma)
  if (kbWillFail) {
    return {
      escalate: true,
      shouldTransfer: false,
      reason: unhelpfulCount >= 1 ? 'repeated_kb_miss' : 'kb_miss',
      response: transferOffer,
    };
  }

  return { escalate: false, shouldTransfer: false, reason: '' };
}
