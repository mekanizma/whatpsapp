/**
 * Bilgi bankası niyet algılama — randevu / bilgi sorusu ayrımı
 * (Keyword arama kaldırıldı; arama knowledge-search.service üzerinden yapılır)
 */

import { KnowledgeItem } from '../types';

const DURATION_QUERY_RE =
  /ne kadar sür|surer|süre|sure|kaç seans|kac seans|kaç dakika|kac dakika|ne zaman biter|how long|how many sessions|how many minutes|how much time|takes how long|duration of|how many hours/i;

/** Bilgi sorusu — randevu akışından önce KB yanıtı verilmeli */
export function isKnowledgeQuestion(message: string): boolean {
  const n = message.toLowerCase().trim();
  return /[?？]|\bnedir\b|\bne kadar\b|\bfiyat|\bücret|\bucret|\bnasıl\b|\bnasil\b|\bvar mı\b|\bvarmi\b|\bhangi\b|\bnerede\b|\bkaç\b|\bkac\b|\bbilgi\b|\baçıkla|\bacikla|\btanıt|\btanit|\bhizmet|\bçalışma saat|\bcalisma saat|\bwhat\b|\bwhere\b|\bwhen\b|\bhow\b|\bprice|\bprices|\bpricing|\bcost|\bfee|\bfees|\btuition|\bworking hours|\bopening hours|\blocation|\baddress|\binformation about/.test(
    n
  );
}

/** Süre sorusu (fiyat sorusu değil) */
export function isDurationQuery(message: string): boolean {
  return DURATION_QUERY_RE.test(message.toLowerCase());
}

/** Klinik bilgi bankası kapsamı dışı sorular */
export function isOffTopicQuery(message: string): boolean {
  return /üniversite|universite|hava (durumu|nasil|nasıl)|restoran|otel|maç|mac sonucu|borsa|döviz|doviz|futbol|dizi|film öner/i.test(
    message.toLowerCase()
  );
}

const APPOINTMENT_CONFIRM_RE =
  /^(evet|onayl?[iıİI]yorum|onaylıyorum|onayliyorum|onay|tamam|uygun|olur|kabul|ok|yes|hayır|hayir)$/iu;
const APPOINTMENT_TIME_RE =
  /\b\d{1,2}[\.\:]\d{2}\b|\b\d{1,2}\s*(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)\b/i;
const APPOINTMENT_PHONE_RE = /(?:\+?90|0)?[\s-]?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/;

/** Randevu süreci — bilgi bankası eşleşmesi olmasa da AI devreye girebilir */
export function isAppointmentIntent(
  message: string,
  history: { sender_type: string; message: string }[] = []
): boolean {
  const trimmed = message.trim();
  const msg = trimmed.toLowerCase();

  if (isKnowledgeQuestion(trimmed)) {
    return false;
  }

  if (/randevu|rezervasyon|appointment|müsait|musait|uygun saat|boş saat|bos saat|tarih al|saat al|görüşme|gorusme|alabilir\s*miyim|alabilirmiyim|almak istiyorum/.test(msg)) {
    return true;
  }

  const recent = history.slice(-8);
  const aiAskedAppointment = recent.some(
    (m) =>
      (m.sender_type === 'ai' || m.sender_type === 'assistant') &&
      /randevu|ad soyad|cep telefon|işlem|doktor|tarih|saat|onay/.test(m.message.toLowerCase())
  );

  if (!aiAskedAppointment) return false;

  if (APPOINTMENT_CONFIRM_RE.test(trimmed)) return true;
  if (APPOINTMENT_PHONE_RE.test(trimmed)) return true;
  if (APPOINTMENT_TIME_RE.test(trimmed)) return true;

  const nameParts = trimmed.split(/\s+/).filter(Boolean);
  if (nameParts.length >= 2 && nameParts.every((p) => p.length >= 2 && /^[\p{L}'-]+$/u.test(p))) {
    return true;
  }

  return false;
}

/** @deprecated Keyword arama kaldırıldı — geriye dönük test uyumluluğu */
export interface KnowledgeFilterResult {
  context: string;
  items: KnowledgeItem[];
  hasRelevantContent: boolean;
  kbEmpty: boolean;
  isBroadQuery: boolean;
  keywords: string[];
}

/** @deprecated Semantik arama kullanın */
export function filterRelevantKnowledge(
  items: KnowledgeItem[],
  _customerMessage: string
): KnowledgeFilterResult {
  return {
    context: '',
    items: [],
    hasRelevantContent: false,
    kbEmpty: items.length === 0,
    isBroadQuery: false,
    keywords: [],
  };
}

/** @deprecated */
export function buildMandatoryKnowledgeContext(): string {
  return '';
}

/** @deprecated */
export function isPriceQuery(): boolean {
  return false;
}

/** @deprecated */
export function isGeneralPriceListQuery(): boolean {
  return false;
}

/** @deprecated */
export function isBroadKnowledgeQuery(): boolean {
  return false;
}

/** @deprecated */
export function extractKeywords(): string[] {
  return [];
}

/** @deprecated */
export function stemTurkishWord(word: string): string {
  return word.toLowerCase();
}

/** @deprecated */
export function haystackMatchesKeyword(): boolean {
  return false;
}
