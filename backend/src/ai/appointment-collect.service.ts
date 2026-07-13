/**
 * Randevu bilgisi toplama — kayıt öncesi zorunlu alan kontrolü
 */

import { ConversationLang, detectConversationLanguage, t, getAppointmentProviderLabel } from './language.service';
import { CONFIRM_WORDS_PATTERN } from './appointment-confirm-tokens';
import {
  buildAppointmentProviderRule,
  shouldAskAppointmentProvider,
} from '../services/appointment-category.service';
import { parseSlotFromText } from './appointment-slot.service';
import type { AppointmentCompanyContext } from './appointment-company-context';
import { DEFAULT_APPOINTMENT_CONTEXT } from './appointment-company-context';
import { hasDateTimeIntent } from './appointment-datetime-tokens';

export interface HistoryMsg {
  sender_type: string;
  message: string;
}

export interface CollectedAppointmentFields {
  customer_name: string | null;
  customer_phone: string | null;
  title: string | null;
  doctor_name: string | null;
}

export type MissingAppointmentField = 'name' | 'phone' | 'title' | 'datetime';

const PHONE_RE = /(?:\+?90|0)?[\s-]?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\d{10,15}/;

function normalizePhone(phone: string): string {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('0')) d = `90${d.slice(1)}`;
  if (d.length === 10 && d.startsWith('5')) d = `90${d}`;
  return d;
}

function extractPhone(text: string): string | null {
  const m = text.match(PHONE_RE);
  if (!m) return null;
  const n = normalizePhone(m[0]);
  return n.length >= 10 ? n : null;
}

const APPOINTMENT_REQUEST_RE = /randevu|rezervasyon|appointment|termin|rendez-vous|cita|reserva|موعد|запись|müsait|musait|available|frei|disponible|alabilir\s*miyim|alabilirmiyim|almak istiyorum|book.*appointment|make.*appointment/i;
const PROFANITY_RE =
  /\b(amk|amına|amina|amın|siktir|sikeyim|orospu|oç|oc\b|yarrak|piç|pic\b|sokuk|göt|got\b|kahpe|ibne|mal\b|salak|aptal)\b/i;
const COMPLAINT_RE =
  /değiştirdin|degistirdin|değiştirmiş|degistirmis|yanlış|yanlis|hatalı|hatalli|sen ekledin|başka randevu yok|kafadan|konu bu mu|konuyu yine|neden değiştir|doğru kaydedemedim|dogru kaydedemedim|yanlış yaz|yanlis yaz|olmaz bu|ne diyosun|ne diyorsun/i;
const CONVERSATIONAL_NONSENSE_RE =
  /\?|^(ne|niye|neden|nasıl|nasil|kim|hangi|kaç|kac|nedir|diyosun|diyorsun|verebilir|istiyorum|sordu|vizyon|kodlad|merhaba|selam|hey|tamam|ok)\b|\b(verebilir|istiyorum|diyosun|diyorsun|vizyon|kodlad)\b/i;

export function isComplaintOrCorrectionMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (PROFANITY_RE.test(trimmed)) return true;
  if (COMPLAINT_RE.test(trimmed)) return true;
  return false;
}

function isAppointmentSummaryMessage(aiMessage: string): boolean {
  return (
    /randevu özeti|appointment summary|onaylıyor musunuz|onayliyor musunuz|do you confirm/i.test(
      aiMessage
    ) ||
    /^\s*(tarih\/saat|date\/time|ad soyad|name|konu|topic|telefon|phone)\s*:/im.test(aiMessage)
  );
}

function isConversationalNonsense(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 3) return true;
  if (CONVERSATIONAL_NONSENSE_RE.test(trimmed)) return true;
  if (/\b(mi|mı|mu|mü)\s*$/iu.test(trimmed)) return true;
  return false;
}

function isAskingForName(aiMessage: string): boolean {
  if (isAppointmentSummaryMessage(aiMessage)) return false;
  const ai = aiMessage.toLocaleLowerCase('tr');
  return /ad.{0,30}soyad|soyad.{0,15}ad|isminiz|adınız|adiniz|ad soyad/.test(ai);
}

function isAskingForServiceTopic(aiMessage: string): boolean {
  if (isAppointmentSummaryMessage(aiMessage)) return false;
  const ai = aiMessage.toLocaleLowerCase('tr');
  return /hangi konu|hangi hizmet|hangi işlem|hangi islem|ne için randevu|ne icin randevu|konu\/hizmet|randevu konusu|işlem veya ziyaret|islem veya ziyaret|işlem için|islem icin|hizmet için|hizmet icin|ziyaret sebebi|what.*(service|for|about)|which service|topic for/.test(
    ai
  );
}

function isRequestingAppointmentFields(aiMessage: string): boolean {
  const ai = aiMessage.toLocaleLowerCase('tr');
  return (
    isAskingForName(ai) ||
    isAskingForPhone(ai) ||
    isAskingForServiceTopic(ai) ||
    /eksik|paylaşır mısınız|paylasir misiniz|oluşturabilmem|olusturabilmem|gerekli bilgi|tek bir mesajda/.test(ai)
  );
}

const SUBJECT_NOISE_RE =
  /\b(almak istiyorum|almak istiyoruz|istiyorum|randevu konusu|konu olarak|için randevu|icin randevu|randevu almak)\b/giu;

const SUBJECT_KEEP_ALMAK_RE = /\b(bilgi|görüş|gorus|danış|danis)\s+almak\b/giu;

const DATETIME_PHRASE_RE =
  /\b(yarın|yarin|bugün|bugun|oburgun|öbürgün|haftaya|gelecek\s+hafta|pazartesi|salı|sali|çarşamba|carsamba|perşembe|persembe|cuma|cumartesi|pazar)(?:\s+\d{1,2}\s*(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik))?\s*(saat\s*)?\d{1,2}([:.]\d{2})?\s*(a|da)?\b|\b\d{1,2}[./]\d{1,2}([./]\d{2,4})?\s*(saat\s*)?\d{1,2}([:.]\d{2})?\b|\b(haftaya|gelecek\s+hafta)(?:\s+saat\s*\d{1,2}([:.]\d{2})?\s*(a|da)?)?\b/giu;

const TOPIC_WORDS = new Set([
  'genel', 'bilgi', 'üniversite', 'universite', 'randevu', 'kontrol', 'görüşme', 'gorusme',
  'danışmanlık', 'danismanlik', 'muayene', 'işlem', 'islem', 'hizmet', 'kayıt', 'kayit',
  'dekan', 'fakülte', 'fakulte', 'bölüm', 'bolum', 'teknik', 'destek', 'kurulum',
]);

export function looksLikeSubject(text: string): boolean {
  const n = text.toLocaleLowerCase('tr');
  if (/hakkında|hakkinda|üzerine|uzere|için|icin|konusu|hakkında bilgi|bilgi almak|görüşmek|gorusmek|yapılması|yapilmasi|yapılması|demo/i.test(n)) {
    return true;
  }
  if (/sistem|hizmetiniz|sisteminiz|ürün|urun|paket|talep/i.test(n)) return true;
  if (/\b(ediyoruz|ediyorum|istiyoruz|istiyorum)\b/i.test(n)) return true;
  return [...TOPIC_WORDS].some((w) => n.includes(w));
}

function isNameOnlyPhrase(text: string, knownName?: string | null): boolean {
  const trimmed = text.trim();
  if (knownName && trimmed.toLocaleLowerCase('tr') === knownName.toLocaleLowerCase('tr')) {
    return true;
  }
  return isValidFullName(trimmed) && !looksLikeSubject(trimmed);
}

function scoreTitleCandidate(text: string, knownName?: string | null): number {
  if (!text || isNameOnlyPhrase(text, knownName)) return -100;
  let score = text.length;
  if (looksLikeSubject(text)) score += 80;
  if (isValidFullName(text) && !looksLikeSubject(text)) score -= 60;
  return score;
}

function stripDateTimePhrases(text: string): string {
  let working = text;
  if (hasDateTimeIntent(working)) {
    working = working.replace(DATETIME_PHRASE_RE, ' ').trim();
  }
  return working.replace(/\s+/g, ' ').trim();
}

function extractNameBeforePhone(text: string): string | null {
  const phoneMatch = text.match(PHONE_RE);
  if (!phoneMatch || phoneMatch.index === undefined || phoneMatch.index <= 0) return null;
  const before = cleanFieldToken(text.slice(0, phoneMatch.index));
  return isValidFullName(before) ? before : null;
}

const AVAILABILITY_TAIL_RE =
  /[.?!]?\s*\b(bugün|bugun|yarin|yarın|en erken|hangi saat(e)?|müsait|musait|uygun|randevu alabilir|alabilir miyim|alabilirmiyim|ne zaman).*$/iu;

function cleanFieldToken(token: string): string {
  return token.replace(/^[\s,.;:!?'"()-]+|[\s,.;:!?'"()-]+$/g, '').trim();
}

function stripAvailabilityQuestion(text: string): string {
  return text.replace(AVAILABILITY_TAIL_RE, '').trim();
}

function cleanSubjectTitle(title: string): string {
  return cleanFieldToken(
    stripAvailabilityQuestion(title)
      .replace(DATETIME_PHRASE_RE, ' ')
      .replace(SUBJECT_NOISE_RE, ' ')
      .replace(/\s+/g, ' ')
  );
}

function extractSubjectFromSegment(segment: string): string | null {
  let working = stripAvailabilityQuestion(segment);
  working = working.replace(APPOINTMENT_REQUEST_RE, ' ').trim();
  working = stripDateTimePhrases(working);
  working = cleanSubjectTitle(working);
  if (!working || !isValidProcedureTitle(working)) return null;
  return working;
}

function parseCommaSeparatedAppointmentFields(text: string): Partial<CollectedAppointmentFields> {
  if (!/[,;]/.test(text) || !extractPhone(text)) return {};

  const segments = text.split(/[,;]+/).map(cleanFieldToken).filter(Boolean);
  let customer_name: string | null = null;
  let customer_phone: string | null = null;
  let title: string | null = null;
  const subjectCandidates: string[] = [];

  for (const seg of segments) {
    const phoneOnly = extractPhone(seg);
    if (phoneOnly && seg.replace(PHONE_RE, '').trim().length < 4) {
      customer_phone = phoneOnly;
      continue;
    }

    const embeddedPhone = extractPhone(seg);
    if (embeddedPhone && seg.length > 12) {
      customer_phone = embeddedPhone;
      const rest = cleanFieldToken(seg.replace(PHONE_RE, ''));
      if (rest) subjectCandidates.push(rest);
      continue;
    }

    const nameCandidate = cleanFieldToken(seg);
    if (!customer_name && isValidFullName(nameCandidate)) {
      customer_name = nameCandidate;
      continue;
    }

    subjectCandidates.push(seg);
  }

  for (const candidate of subjectCandidates) {
    const parts = candidate.split(/[.!?]+/).map(cleanFieldToken).filter(Boolean);
    for (const part of parts) {
      const topic = extractSubjectFromSegment(part);
      if (topic && (!title || scoreTitleCandidate(topic, customer_name) > scoreTitleCandidate(title, customer_name))) {
        title = topic;
      }
    }
  }

  return { customer_name, customer_phone, title };
}

function extractLeadingName(text: string): { name: string | null; remainder: string } {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  for (const len of [3, 2]) {
    if (parts.length < len) continue;
    const candidate = parts.slice(0, len).join(' ');
    if (isValidFullName(candidate)) {
      return {
        name: candidate,
        remainder: parts.slice(len).join(' ').trim(),
      };
    }
  }
  return { name: null, remainder: text.trim() };
}

function isLikelyTopicOnlyMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!looksLikeSubject(trimmed)) return false;
  if (/[,;]/.test(trimmed)) return false;
  if (extractPhone(trimmed)) return false;
  const withoutPhone = stripDateTimePhrases(trimmed.replace(PHONE_RE, ' ').trim());
  const leading = extractLeadingName(withoutPhone);
  if (leading.name && isValidFullName(leading.name) && !looksLikeSubject(leading.name)) return false;
  return true;
}

/** Tek mesajdan ad, telefon ve konu çıkarır */
export function parseInlineAppointmentFields(text: string): Partial<CollectedAppointmentFields> {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 3) return {};
  if (isComplaintOrCorrectionMessage(trimmed)) return {};
  if (CONFIRM_WORDS_PATTERN.test(trimmed)) return {};

  if (isLikelyTopicOnlyMessage(trimmed)) {
    const phone = extractPhone(trimmed);
    let subject = stripDateTimePhrases(trimmed.replace(PHONE_RE, ' ').trim());
    subject = cleanSubjectTitle(subject.replace(APPOINTMENT_REQUEST_RE, ' '));
    if (isValidProcedureTitle(subject)) {
      return { customer_name: null, customer_phone: phone, title: subject };
    }
  }

  const commaParsed = parseCommaSeparatedAppointmentFields(trimmed);
  if (commaParsed.customer_phone || commaParsed.customer_name || commaParsed.title) {
    return {
      customer_name: commaParsed.customer_name || null,
      customer_phone: commaParsed.customer_phone || null,
      title: commaParsed.title ? cleanSubjectTitle(commaParsed.title) : null,
    };
  }

  const phone = extractPhone(trimmed);
  let customer_name = extractNameBeforePhone(trimmed);
  if (customer_name) customer_name = cleanFieldToken(customer_name);

  let working = stripDateTimePhrases(trimmed.replace(PHONE_RE, ' ').trim());
  working = stripAvailabilityQuestion(working);
  working = working.replace(APPOINTMENT_REQUEST_RE, ' ').trim();
  working = working.replace(SUBJECT_NOISE_RE, ' ').replace(/\s+/g, ' ').trim();

  if (!customer_name && working) {
    const leading = extractLeadingName(working);
    if (leading.name) {
      customer_name = leading.name;
      working = leading.remainder;
    }
  } else if (customer_name && working.toLocaleLowerCase('tr').startsWith(customer_name.toLocaleLowerCase('tr'))) {
    working = working.slice(customer_name.length).trim();
  }

  let title: string | null = null;
  if (working) {
    const normalized = cleanSubjectTitle(working.replace(SUBJECT_KEEP_ALMAK_RE, (m) => m.replace(/\s+almak\b/i, '')));
    if (isValidProcedureTitle(normalized) && !isNameOnlyPhrase(normalized, customer_name)) {
      title = normalized;
    }
  }

  return {
    customer_name: customer_name || null,
    customer_phone: phone,
    title,
  };
}

/** Telefon ve tarih/saat parçalarını ayıklayıp randevu konusunu çıkarır */
export function extractProcedureTitleFromMessage(text: string): string | null {
  const inline = parseInlineAppointmentFields(text);
  return inline.title || null;
}

function isAskingForPhone(aiMessage: string): boolean {
  if (isAppointmentSummaryMessage(aiMessage)) return false;
  return /telefon|numara|cep/.test(aiMessage.toLocaleLowerCase('tr'));
}

function isAskingForProvider(aiMessage: string): boolean {
  const ai = aiMessage.toLocaleLowerCase('tr');
  return /personel|temsilci|sağlayıcı|saglayici|provider|staff|uzman|tercih|hekim|doktor|specialist|assigned/.test(
    ai
  );
}

export function isValidFullName(name: string): boolean {
  const trimmed = name.trim();
  if (isComplaintOrCorrectionMessage(trimmed)) return false;
  if (isConversationalNonsense(trimmed)) return false;
  if (APPOINTMENT_REQUEST_RE.test(trimmed)) return false;
  if (
    /^(verdim|tamam|evet|hayır|hayir|hey|merhaba|selam|ok|olur|zaten|canım|canim|bir daha|sorduğum|sordugum|cevap)/i.test(
      trimmed
    )
  ) {
    return false;
  }
  if (/^(sen|siz|ben|beni|bana|sana|size)\b/i.test(trimmed)) return false;
  if (/\b(yardımcı|yardimci|olur\s*musun|olur\s*müsün)\b/i.test(trimmed)) return false;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  if (/hakkında|hakkinda|üzerine|uzere/i.test(trimmed)) return false;
  if (looksLikeSubject(trimmed)) return false;
  if (/\b(ediyoruz|ediyorum|istiyoruz|istiyorum|talep)\b/i.test(trimmed)) return false;
  if (/\b\w+(inizin|ınızın|ınızı|unuzu|inizi|sunu|sinu|nızı|nizi)\b/i.test(trimmed)) return false;
  if (/\b\w+(yorum|ecem|eceğim|ecegim|acak|acağım|acagim|ücem|ucem|iyorum|iyoruz|uyoruz|yoruz|mak|mek|mış|mis|mus)\b/i.test(trimmed)) {
    return false;
  }
  if (parts.every((p) => TOPIC_WORDS.has(p.toLocaleLowerCase('tr')))) return false;
  if (parts.some((p) => TOPIC_WORDS.has(p.toLocaleLowerCase('tr')))) return false;
  if (/\b(alma|satım|satim|deneme|denemek|bilgi|görüş|gorus|randevu|kontrol|üniversite|universite|kurulum|destek|hakkında|hakkinda|hocayla|dekan)\b/i.test(trimmed)) {
    return false;
  }
  const junk = new Set([
    'ya', 'de', 'da', 'mi', 'mı', 've', 'bir', 'bu', 'ne', 'ki', 'kim', 'nedir', 'peki', 'diyosun', 'diyorsun',
  ]);
  if (parts.every((p) => junk.has(p.toLowerCase()) || p.length < 3)) return false;
  if (parts.some((p) => junk.has(p.toLowerCase()))) return false;
  return parts.every((p) => {
    const clean = p.replace(/[,.;:!?'"()-]+$/g, '');
    return clean.length >= 2 && /^[\p{L}'-]+$/u.test(clean);
  });
}

export function isValidProcedureTitle(title: string): boolean {
  const text = title.trim();
  if (isComplaintOrCorrectionMessage(text)) return false;
  if (text.length < 3) return false;
  if (isConversationalNonsense(text)) return false;
  if (APPOINTMENT_REQUEST_RE.test(text)) return false;
  if (/^(ediyoruz|istiyoruz|ediyorum|istiyorum|talep|demosunu)$/i.test(text)) return false;
  if (/^\p{L}{3,14}(yoruz|iyoruz|uyoruz|ıyoruz|yorum|iyorum)$/iu.test(text) && !looksLikeSubject(text)) {
    return false;
  }
  if (/sorduğum|sordugum|cevap ver|verdim|zaten|hey|merhaba|tamam|ne kadar|fiyat|ücret|ucret|vizyon|kodlad/i.test(text)) {
    return false;
  }
  if (isValidFullName(text) && !looksLikeSubject(text) && text.split(/\s+/).filter(Boolean).length <= 2) {
    return false;
  }
  return true;
}

function isValidStaffName(name: string): boolean {
  return isValidProcedureTitle(name) && !/randevu|verebilir|istiyorum/i.test(name);
}

function isAiSender(senderType: string): boolean {
  return senderType === 'ai' || senderType === 'assistant';
}

/** Konuşma geçmişinden toplanan bilgileri çıkar */
export function parseCollectedFields(
  history: HistoryMsg[],
  latestMessage: string
): CollectedAppointmentFields {
  const messages = [...history, { sender_type: 'customer', message: latestMessage }];
  let customer_name: string | null = null;
  let customer_phone: string | null = null;
  let title: string | null = null;
  let doctor_name: string | null = null;
  let bestTitleScore = -Infinity;

  const absorbInline = (inline: Partial<CollectedAppointmentFields>) => {
    if (inline.customer_name && !customer_name) customer_name = inline.customer_name;
    if (inline.customer_phone) customer_phone = inline.customer_phone;
    if (inline.title) {
      const score = scoreTitleCandidate(inline.title, customer_name);
      if (score > bestTitleScore) {
        bestTitleScore = score;
        title = inline.title;
      }
    }
  };

  for (const m of messages) {
    if (m.sender_type !== 'customer') continue;
    absorbInline(parseInlineAppointmentFields(m.message));
  }

  for (let i = 0; i < messages.length - 1; i++) {
    const curr = messages[i];
    const next = messages[i + 1];
    if (!isAiSender(curr.sender_type) || next.sender_type !== 'customer') continue;

    const ai = curr.message.toLocaleLowerCase('tr');
    const cust = next.message.trim();
    if (!cust || cust.length < 2) continue;
    if (isComplaintOrCorrectionMessage(cust)) continue;
    if (CONFIRM_WORDS_PATTERN.test(cust)) continue;

    if (isAskingForName(ai) && isValidFullName(cust)) {
      customer_name = cust;
    }
    if (isAskingForPhone(ai)) {
      const p = extractPhone(cust);
      if (p) customer_phone = p;
    }
    if (isAskingForServiceTopic(ai) || isRequestingAppointmentFields(ai)) {
      const inline = parseInlineAppointmentFields(cust);
      if (inline.title) {
        const score = scoreTitleCandidate(inline.title, customer_name);
        if (score > bestTitleScore) {
          bestTitleScore = score;
          title = inline.title;
        }
      }
    }
    if (isAskingForProvider(ai) && !/^(yok|hayır|hayir|farketmez|yoktur|no|none)$/i.test(cust)) {
      if (isValidStaffName(cust)) doctor_name = cust;
    }
  }

  for (const m of messages) {
    if (m.sender_type !== 'customer') continue;
    const p = extractPhone(m.message);
    if (p) customer_phone = p;
  }

  if (!customer_name) {
    for (let i = 0; i < messages.length - 1; i++) {
      const curr = messages[i];
      const next = messages[i + 1];
      if (!isAiSender(curr.sender_type) || next.sender_type !== 'customer') continue;
      if (isAskingForName(curr.message)) {
        const inline = parseInlineAppointmentFields(next.message.trim());
        if (inline.customer_name) {
          customer_name = inline.customer_name;
          break;
        }
        if (isValidFullName(next.message.trim())) {
          customer_name = next.message.trim();
          break;
        }
      }
    }
  }

  if (!customer_name) {
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.sender_type !== 'customer') continue;
      const inline = parseInlineAppointmentFields(m.message);
      if (inline.customer_name) {
        customer_name = inline.customer_name;
        break;
      }
      const candidate = m.message.trim();
      if (isComplaintOrCorrectionMessage(candidate)) continue;
      if (!isValidFullName(candidate)) continue;
      if (CONFIRM_WORDS_PATTERN.test(candidate)) continue;
      const prev = i > 0 ? messages[i - 1] : null;
      if (prev && isAiSender(prev.sender_type) && isAskingForServiceTopic(prev.message)) continue;
      customer_name = candidate;
      break;
    }
  }

  return { customer_name, customer_phone, title, doctor_name };
}

/** Prompt'a eklenecek özet — AI aynı soruyu tekrar sormasın */
export function buildCollectedFieldsContext(
  history: HistoryMsg[],
  latestMessage: string,
  lang?: ConversationLang,
  companyCategory?: string | null
): string {
  const conversationLang = lang ?? detectConversationLanguage(latestMessage, history);
  const c = parseCollectedFields(history, latestMessage);
  const askProvider = shouldAskAppointmentProvider(companyCategory);
  const providerLabel = askProvider
    ? getAppointmentProviderLabel(conversationLang, undefined, companyCategory)
    : '';
  const lines = [
    `Ad soyad: ${c.customer_name || '(eksik)'}`,
    `Telefon: ${c.customer_phone || '(eksik)'}`,
    `Konu: ${c.title || '(eksik)'}`,
    askProvider && c.doctor_name ? `${providerLabel}: ${c.doctor_name}` : '',
  ].filter(Boolean);

  const providerRule = buildAppointmentProviderRule(companyCategory);

  const missing = getMissingRequiredFields(c, undefined, history, latestMessage);
  let next = '';
  if (missing.length > 0) {
    next = `\nEKSİK ALANLAR: ${missing.map((f) => fieldLabel(f, conversationLang)).join(', ')}\nMüsaitlik veya saat ÖNERME. Yalnızca eksik bilgileri iste.`;
  } else {
    next = '\nTüm bilgiler tamam — müsaitlik hakkında bilgi VERME; sistem veritabanını kontrol eder.';
  }

  return `${providerRule}\n\nTOPLANAN RANDEVU BİLGİLERİ:\n${lines.join('\n')}${next}`;
}

function fieldLabel(field: MissingAppointmentField, lang: ConversationLang): string {
  switch (field) {
    case 'name':
      return t(lang, 'appointment_field_name');
    case 'phone':
      return t(lang, 'appointment_field_phone');
    case 'title':
      return t(lang, 'appointment_field_subject');
    case 'datetime':
      return t(lang, 'appointment_field_datetime');
    default:
      return field;
  }
}

export function buildAllRequiredFieldsMessage(lang: ConversationLang = 'tr'): string {
  return t(lang, 'appointment_request_all_fields');
}

export function buildMissingFieldsMessage(
  missing: MissingAppointmentField[],
  lang: ConversationLang = 'tr'
): string {
  const fields = missing.map((f) => `• ${fieldLabel(f, lang)}`).join('\n');
  return t(lang, 'appointment_request_missing_fields', { fields });
}

export function hasCollectedDateTime(
  history: HistoryMsg[],
  latestMessage: string,
  ctx: AppointmentCompanyContext = DEFAULT_APPOINTMENT_CONTEXT
): boolean {
  const options = { timezone: ctx.timezone, ref: ctx.parseRef };
  const messages = [...history, { sender_type: 'customer', message: latestMessage }];
  for (const m of messages) {
    if (m.sender_type !== 'customer') continue;
    if (!hasDateTimeIntent(m.message)) continue;
    if (parseSlotFromText(m.message, options)) return true;
  }
  return false;
}

export function getMissingRequiredFields(
  collected: CollectedAppointmentFields,
  fromAction?: {
    customer_name?: string;
    customer_phone?: string;
    title?: string;
    starts_at?: string;
    ends_at?: string;
  },
  history: HistoryMsg[] = [],
  latestMessage = '',
  ctx: AppointmentCompanyContext = DEFAULT_APPOINTMENT_CONTEXT
): MissingAppointmentField[] {
  const name = (fromAction?.customer_name || collected.customer_name || '').trim();
  const phone = normalizePhone(fromAction?.customer_phone || collected.customer_phone || '');
  const titleText = (fromAction?.title || collected.title || '').trim();

  const missing: MissingAppointmentField[] = [];
  if (!isValidFullName(name)) missing.push('name');
  if (!phone || phone.length < 10) missing.push('phone');
  if (!isValidProcedureTitle(titleText)) missing.push('title');

  const hasDatetime =
    !!(fromAction?.starts_at && fromAction?.ends_at) ||
    hasCollectedDateTime(history, latestMessage, ctx);
  if (!hasDatetime) missing.push('datetime');

  return missing;
}

export function promptForMissingField(
  field: MissingAppointmentField,
  lang: ConversationLang = 'tr'
): string {
  switch (field) {
    case 'name':
      return t(lang, 'appointment_name');
    case 'phone':
      return t(lang, 'appointment_phone');
    case 'title':
      return t(lang, 'appointment_title');
    case 'datetime':
      return t(lang, 'appointment_datetime_required');
    default:
      return t(lang, 'appointment_missing_default');
  }
}

export function getFirstMissingPrompt(
  collected: CollectedAppointmentFields,
  fromAction?: { customer_name?: string; customer_phone?: string; title?: string },
  lang: ConversationLang = 'tr',
  history: HistoryMsg[] = [],
  latestMessage = '',
  ctx: AppointmentCompanyContext = DEFAULT_APPOINTMENT_CONTEXT
): string | null {
  const missing = getMissingRequiredFields(collected, fromAction, history, latestMessage, ctx);
  if (missing.length === 0) return null;
  if (missing.length === 1) return promptForMissingField(missing[0], lang);
  return buildMissingFieldsMessage(missing, lang);
}

export function mergeCollectedWithAction<T extends {
  customer_name?: string;
  customer_phone?: string;
  title?: string;
  doctor_name?: string;
  preferred_doctor?: string;
}>(
  collected: CollectedAppointmentFields,
  action: T
): T & { customer_name: string; customer_phone: string; title: string } {
  const actionName = action.customer_name?.trim() || '';
  const actionTitle = action.title?.trim() || '';
  return {
    ...action,
    customer_name: (isValidFullName(actionName) ? actionName : collected.customer_name || '').trim(),
    customer_phone: normalizePhone(action.customer_phone?.trim() || collected.customer_phone || ''),
    title: (isValidProcedureTitle(actionTitle) ? actionTitle : collected.title || '').trim(),
    doctor_name: action.doctor_name || action.preferred_doctor || collected.doctor_name || undefined,
  };
}

/** Kayıt denemesi öncesi — eksik alan varsa engelle */
export function blockBookingIfIncomplete(
  history: HistoryMsg[],
  latestMessage: string,
  fromAction?: { customer_name?: string; customer_phone?: string; title?: string },
  lang?: ConversationLang,
  ctx: AppointmentCompanyContext = DEFAULT_APPOINTMENT_CONTEXT
): { blocked: boolean; message: string | null; collected: CollectedAppointmentFields } {
  const conversationLang = lang ?? detectConversationLanguage(latestMessage, history);
  const collected = parseCollectedFields(history, latestMessage);
  const prompt = getFirstMissingPrompt(
    collected,
    fromAction,
    conversationLang,
    history,
    latestMessage,
    ctx
  );
  if (prompt) {
    return { blocked: true, message: prompt, collected };
  }
  return { blocked: false, message: null, collected };
}
