/**
 * Kızgınlık ve tekrarlayan cevapsızlık — canlı temsilciye yükseltme
 */

import { normalizeForGate } from './ai-gate.service';

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

export const TRANSFER_OFFER_MSG =
  'Bu konuda net bilgiye ulaşamadım. Yanlış yönlendirmemek için sizi temsilciye aktarabilirim. Başka bir sorunuz varsa yine yardımcı olmaya devam edebilirim.';

export const ESCALATION_TEMPLATES = {
  frustration:
    'Yaşadığınız olumsuz deneyim için üzgünüm. Sizi hemen canlı destek temsilcimize bağlıyorum. Kısa süre içinde size dönüş yapılacaktır.',
  repeatedFailure: TRANSFER_OFFER_MSG,
  wrongAnswer: TRANSFER_OFFER_MSG,
};

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
export function detectImmediateEscalation(message: string): EscalationResult {
  const normalized = normalizeForGate(message.trim());

  if (FRUSTRATION_PATTERNS.some((p) => p.test(normalized))) {
    return {
      escalate: true,
      shouldTransfer: true,
      reason: 'customer_frustration',
      response: ESCALATION_TEMPLATES.frustration,
    };
  }

  return { escalate: false, shouldTransfer: false, reason: '' };
}

/** Konuşma geçmişine göre tekrarlayan cevapsızlık — yumuşak teklif, otomatik aktarım yok */
export function detectConversationEscalation(
  message: string,
  history: ConversationMessage[],
  kbWillFail: boolean
): EscalationResult {
  const immediate = detectImmediateEscalation(message);
  if (immediate.escalate) return immediate;

  // Memnuniyetsizlik → yumuşak teklif, cevap vermeye devam
  const normalized = normalizeForGate(message.trim());
  if (DISSATISFACTION_PATTERNS.some((p) => p.test(normalized))) {
    return {
      escalate: true,
      shouldTransfer: false,
      reason: 'customer_dissatisfaction',
      response: TRANSFER_OFFER_MSG,
    };
  }

  const unhelpfulCount = countUnhelpfulAiReplies(history);

  // KB'de yok → yumuşak temsilci teklifi (ticket açma)
  if (kbWillFail) {
    return {
      escalate: true,
      shouldTransfer: false,
      reason: unhelpfulCount >= 1 ? 'repeated_kb_miss' : 'kb_miss',
      response: TRANSFER_OFFER_MSG,
    };
  }

  return { escalate: false, shouldTransfer: false, reason: '' };
}
