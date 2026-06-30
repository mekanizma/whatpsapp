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
  reason: string;
  response?: string;
}

export const ESCALATION_TEMPLATES = {
  frustration:
    'Yaşadığınız olumsuz deneyim için üzgünüm. Sizi hemen canlı destek temsilcimize bağlıyorum. Kısa süre içinde size dönüş yapılacaktır.',
  repeatedFailure:
    'Talebinize yeterince yardımcı olamadığım için üzgünüm. Sizi canlı bir temsilciye aktarıyorum.',
  wrongAnswer:
    'Önceki yanıtım yeterli olmadıysa özür dilerim. Sizi canlı destek temsilcimize aktarıyorum.',
};

const FRUSTRATION_PATTERNS = [
  /kizgin|sinirliyim|sinir oldum|cildirdim|cildir/,
  /biktim|yeter( artik)?|sabrim tas/,
  /sacma|anlamiyorsun|anlamadin|aptal|salak/,
  /robot|bot(sun)?|insan (istiyorum|bagla)/,
  /berbat|rezalet|kotu hizmet|igrenc/,
  /yardimci olmuyor|cevap vermiyor|bos (konusuyor|yapiyor)/,
  /yanlis (bilgi|cevap)|hala ayni|tekrar( ediyor)?/,
  /memnun degil|begenmedim|ise yaramiyor|faydasi yok/,
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
  /temsilciye aktar/,
  /net bilgiye ulasamadim/,
  /yanlis yonlendirmemek icin/,
];

function similarIntent(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const wordsA = a.split(/\s+/).filter((w) => w.length > 3);
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 3));
  const overlap = wordsA.filter((w) => wordsB.has(w)).length;
  return overlap >= 2;
}

function countUnhelpfulAiReplies(history: ConversationMessage[]): number {
  return history
    .slice(-10)
    .filter(
      (m) =>
        m.sender_type === 'ai' &&
        AI_UNHELPFUL_PATTERNS.some((p) => p.test(normalizeForGate(m.message)))
    ).length;
}

/** Mevcut mesajda kızgınlık / canlı destek talebi */
export function detectImmediateEscalation(message: string): EscalationResult {
  const normalized = normalizeForGate(message.trim());

  if (FRUSTRATION_PATTERNS.some((p) => p.test(normalized))) {
    return { escalate: true, reason: 'customer_frustration', response: ESCALATION_TEMPLATES.frustration };
  }

  if (DISSATISFACTION_PATTERNS.some((p) => p.test(normalized))) {
    return { escalate: true, reason: 'customer_dissatisfaction', response: ESCALATION_TEMPLATES.wrongAnswer };
  }

  return { escalate: false, reason: '' };
}

/** Konuşma geçmişine göre tekrarlayan cevapsızlık */
export function detectConversationEscalation(
  message: string,
  history: ConversationMessage[],
  kbWillFail: boolean
): EscalationResult {
  const immediate = detectImmediateEscalation(message);
  if (immediate.escalate) return immediate;

  const unhelpfulCount = countUnhelpfulAiReplies(history);
  const recentCustomer = history
    .filter((m) => m.sender_type === 'customer')
    .slice(-3)
    .map((m) => normalizeForGate(m.message));

  // 2+ kez bilgi bankasında cevap bulunamadı
  if (unhelpfulCount >= 2 || (unhelpfulCount >= 1 && kbWillFail)) {
    return { escalate: true, reason: 'repeated_kb_miss', response: ESCALATION_TEMPLATES.repeatedFailure };
  }

  // Müşteri aynı konuyu tekrar soruyor ve önce yardımsız cevap almış
  if (recentCustomer.length >= 2 && unhelpfulCount >= 1) {
    const [prev, last] = recentCustomer.slice(-2);
    if (similarIntent(prev, last)) {
      return { escalate: true, reason: 'repeated_question', response: ESCALATION_TEMPLATES.repeatedFailure };
    }
  }

  // Mevcut soru da KB'de yok ve daha önce en az 1 yardımsız AI yanıtı var
  if (kbWillFail && unhelpfulCount >= 1) {
    return { escalate: true, reason: 'persistent_unanswered', response: ESCALATION_TEMPLATES.repeatedFailure };
  }

  return { escalate: false, reason: '' };
}
