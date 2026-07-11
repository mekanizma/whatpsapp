/**
 * Randevu bilgisi toplama — kayıt öncesi zorunlu alan kontrolü
 */

import { ConversationLang, detectConversationLanguage, t, getAppointmentProviderLabel } from './language.service';
import {
  buildAppointmentProviderRule,
  shouldAskAppointmentProvider,
} from '../services/appointment-category.service';

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

export type MissingAppointmentField = 'name' | 'phone' | 'title';

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

const CONFIRM_WORDS = /^(evet|onayl?[iıİI]yorum|onaylıyorum|onayliyorum|onay|tamam|uygun|olur|kabul|ok|yes|hayır|hayir)$/iu;
const APPOINTMENT_REQUEST_RE = /randevu|rezervasyon|appointment|müsait|musait|alabilir\s*miyim|alabilirmiyim|almak istiyorum/i;
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
  return /hangi konu|hangi hizmet|hangi işlem|hangi islem|ne için randevu|ne icin randevu|konu\/hizmet|işlem veya ziyaret|islem veya ziyaret|işlem için|islem icin|hizmet için|hizmet icin|ziyaret sebebi|what.*(service|for|about)|which service|topic for/.test(
    ai
  );
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
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  const junk = new Set([
    'ya', 'de', 'da', 'mi', 'mı', 've', 'bir', 'bu', 'ne', 'ki', 'kim', 'nedir', 'peki', 'diyosun', 'diyorsun',
  ]);
  if (parts.every((p) => junk.has(p.toLowerCase()) || p.length < 3)) return false;
  if (parts.some((p) => junk.has(p.toLowerCase()))) return false;
  return parts.every((p) => p.length >= 2);
}

export function isValidProcedureTitle(title: string): boolean {
  const text = title.trim();
  if (isComplaintOrCorrectionMessage(text)) return false;
  if (text.length < 3) return false;
  if (isConversationalNonsense(text)) return false;
  if (APPOINTMENT_REQUEST_RE.test(text)) return false;
  if (/sorduğum|sordugum|cevap ver|verdim|zaten|hey|merhaba|tamam|ne kadar|fiyat|ücret|ucret|vizyon|kodlad/i.test(text)) {
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

  for (let i = 0; i < messages.length - 1; i++) {
    const curr = messages[i];
    const next = messages[i + 1];
    if (!isAiSender(curr.sender_type) || next.sender_type !== 'customer') continue;

    const ai = curr.message.toLocaleLowerCase('tr');
    const cust = next.message.trim();
    if (!cust || cust.length < 2) continue;
    if (isComplaintOrCorrectionMessage(cust)) continue;
    if (CONFIRM_WORDS.test(cust)) continue;

    if (isAskingForName(ai) && isValidFullName(cust)) {
      customer_name = cust;
    }
    if (isAskingForPhone(ai)) {
      const p = extractPhone(cust);
      if (p) customer_phone = p;
    }
    if (isAskingForServiceTopic(ai)) {
      if (!extractPhone(cust) && isValidProcedureTitle(cust)) {
        title = cust;
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
      if (isAskingForName(curr.message) && isValidFullName(next.message.trim())) {
        customer_name = next.message.trim();
        break;
      }
    }
  }

  if (!customer_name) {
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.sender_type !== 'customer') continue;
      const candidate = m.message.trim();
      if (isComplaintOrCorrectionMessage(candidate)) continue;
      if (!isValidFullName(candidate)) continue;
      if (extractPhone(candidate)) continue;
      if (CONFIRM_WORDS.test(candidate)) continue;
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

  const missing = getMissingRequiredFields(c);
  let next = '';
  if (missing.length > 0) {
    next = `\nSIRADAKİ TEK SORU: ${promptForMissingField(missing[0], conversationLang)}\nZaten alınan bilgileri TEKRAR SORMA.`;
  } else {
    next = '\nTüm bilgiler tamam — tarih/saat öner veya onay bekle.';
  }

  return `${providerRule}\n\nTOPLANAN RANDEVU BİLGİLERİ:\n${lines.join('\n')}${next}`;
}

export function getMissingRequiredFields(
  collected: CollectedAppointmentFields,
  fromAction?: {
    customer_name?: string;
    customer_phone?: string;
    title?: string;
  }
): MissingAppointmentField[] {
  const name = (fromAction?.customer_name || collected.customer_name || '').trim();
  const phone = normalizePhone(fromAction?.customer_phone || collected.customer_phone || '');
  const titleText = (fromAction?.title || collected.title || '').trim();

  const missing: MissingAppointmentField[] = [];
  if (!isValidFullName(name)) missing.push('name');
  if (!phone || phone.length < 10) missing.push('phone');
  if (!isValidProcedureTitle(titleText)) missing.push('title');
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
    default:
      return t(lang, 'appointment_missing_default');
  }
}

export function getFirstMissingPrompt(
  collected: CollectedAppointmentFields,
  fromAction?: { customer_name?: string; customer_phone?: string; title?: string },
  lang: ConversationLang = 'tr'
): string | null {
  const missing = getMissingRequiredFields(collected, fromAction);
  if (missing.length === 0) return null;
  return promptForMissingField(missing[0], lang);
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
  lang?: ConversationLang
): { blocked: boolean; message: string | null; collected: CollectedAppointmentFields } {
  const conversationLang = lang ?? detectConversationLanguage(latestMessage, history);
  const collected = parseCollectedFields(history, latestMessage);
  const prompt = getFirstMissingPrompt(collected, fromAction, conversationLang);
  if (prompt) {
    return { blocked: true, message: prompt, collected };
  }
  return { blocked: false, message: null, collected };
}
