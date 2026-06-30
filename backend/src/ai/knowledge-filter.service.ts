/**
 * Bilgi bankası filtreleme — yalnızca ilgili içerik seçilir
 */

import { KnowledgeItem } from '../types';
import { config } from '../config';

const STOP_WORDS = new Set([
  'bir', 've', 'ile', 'için', 'icin', 'mi', 'mı', 'mu', 'mü', 'ne', 'nasıl', 'nasil',
  'kaç', 'kac', 'var', 'yok', 'bu', 'şu', 'de', 'da', 'ki', 'ben', 'siz', 'verin',
  'ver', 'bilgi', 'hakkinda', 'hakkında', 'hakkinda', 'klinik', 'kliniğiniz', 'kliniginiz',
  'nedir', 'neler', 'nelerdir', 'misiniz', 'musunuz', 'mısınız', 'olur', 'olurmu', 'olurmu',
  'hangisi', 'hangi', 'nerede', 'kim', 'en', 'deki', 'iyi', 'olan', 'olarak', 'için', 'icin',
  'about', 'your', 'tell', 'give', 'information', 'clinic', 'what', 'how', 'the', 'and',
]);

const TR_SUFFIXES = [
  'leriniz', 'larınız', 'lerimiz', 'larımız', 'siniz', 'sınız', 'leri', 'ları',
  'ler', 'lar', 'niz', 'nız', 'miz', 'mız', 'sin', 'sın', 'dir', 'dır', 'dur', 'dür',
  'ti', 'tı', 'tu', 'tü', 'si', 'sı', 'su', 'sü', 'i', 'ı', 'u', 'ü',
];

export function stemTurkishWord(word: string): string {
  let w = word.toLowerCase();
  for (const suffix of TR_SUFFIXES) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) {
      return w.slice(0, -suffix.length);
    }
  }
  return w;
}

function haystackMatchesKeyword(haystack: string, keyword: string): boolean {
  const kw = keyword.toLowerCase();
  if (haystack.includes(kw)) return true;
  const stem = stemTurkishWord(kw);
  return stem.length >= 3 && haystack.includes(stem);
}

export interface KnowledgeFilterResult {
  context: string;
  items: KnowledgeItem[];
  hasRelevantContent: boolean;
  kbEmpty: boolean;
  isBroadQuery: boolean;
  keywords: string[];
}

export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\wğüşıöçĞÜŞİÖÇ\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Genel / belirsiz bilgi talebi — tüm KB dökülmemeli */
export function isBroadKnowledgeQuery(message: string): boolean {
  const n = message.toLowerCase().trim();
  const specific =
    /fiyat|ücret|ucret|ne kadar|kaç tl|kac tl|ağrı|agri|acı|aci|nasıl yapıl|nasil yapil|nedir|kaç seans|kac seans|sürer|surer|randevu|dolgu|kanal|implant|beyazlat|ortodont|çekim|cekim|protez|kaplama|muayene/.test(
      n
    );
  if (specific) return false;

  return /bilgi ver|hakkında bilgi|hakkinda bilgi|genel bilgi|neler yap|hangi hizmet|tanıt|tanit|kliniğiniz|kliniginiz|hakkında|hakkinda|about your|tell me about|what do you offer|services/i.test(
    n
  );
}

function scoreItem(item: KnowledgeItem, keywords: string[]): number {
  const haystack = `${item.title} ${item.content} ${item.category || ''}`.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (haystackMatchesKeyword(haystack, kw)) {
      score += kw.length > 4 ? 2 : 1;
    }
  }
  return score;
}

/** Klinik bilgi bankası kapsamı dışı sorular */
export function isOffTopicQuery(message: string): boolean {
  return /üniversite|universite|hava (durumu|nasil|nasıl)|restoran|otel|maç|mac sonucu|borsa|döviz|doviz|futbol|dizi|film öner/i.test(
    message.toLowerCase()
  );
}

/** Bilgi sorusu — randevu akışından önce KB yanıtı verilmeli */
export function isKnowledgeQuestion(message: string): boolean {
  const n = message.toLowerCase().trim();
  return /[?？]|\bnedir\b|\bne kadar\b|\bfiyat|\bücret|\bucret|\bnasıl\b|\bnasil\b|\bvar mı\b|\bvarmi\b|\bhangi\b|\bnerede\b|\bkaç\b|\bkac\b|\bbilgi\b|\baçıkla|\bacikla|\btanıt|\btanit|\bhizmet|\bçalışma saat|\bcalisma saat/.test(
    n
  );
}

export function filterRelevantKnowledge(
  items: KnowledgeItem[],
  customerMessage: string
): KnowledgeFilterResult {
  const keywords = extractKeywords(customerMessage);
  const broad = isBroadKnowledgeQuery(customerMessage);

  if (isOffTopicQuery(customerMessage)) {
    return {
      context: '',
      items: [],
      hasRelevantContent: false,
      kbEmpty: items.length === 0,
      isBroadQuery: false,
      keywords,
    };
  }

  if (!items.length) {
    return {
      context: '',
      items: [],
      hasRelevantContent: false,
      kbEmpty: true,
      isBroadQuery: broad,
      keywords,
    };
  }

  if (broad) {
    const titles = items.map((k) => k.title).filter(Boolean);
    const context = titles.map((t) => `• ${t}`).join('\n');
    return {
      context,
      items,
      hasRelevantContent: true,
      kbEmpty: false,
      isBroadQuery: true,
      keywords,
    };
  }

  if (keywords.length === 0) {
    return {
      context: '',
      items: [],
      hasRelevantContent: false,
      kbEmpty: false,
      isBroadQuery: false,
      keywords,
    };
  }

  const ranked = items
    .map((item) => ({ item, score: scoreItem(item, keywords) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    const looseWords = customerMessage
      .toLowerCase()
      .replace(/[^\wğüşıöçĞÜŞİÖÇ\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
      .map(stemTurkishWord);

    if (looseWords.length > 0) {
      const looseRanked = items
        .map((item) => {
          const haystack = `${item.title} ${item.content} ${item.category || ''}`.toLowerCase();
          let score = 0;
          for (const w of looseWords) {
            if (haystack.includes(w)) score += 1;
          }
          return { item, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);

      if (looseRanked.length > 0) {
        const selected = [looseRanked[0].item];
        let context = selected.map((k) => `### ${k.title}\n${k.content}`).join('\n\n');
        if (context.length > config.ai.maxKnowledgeChars) {
          context = context.slice(0, config.ai.maxKnowledgeChars) + '\n...[kısaltıldı]';
        }
        return {
          context,
          items: selected,
          hasRelevantContent: true,
          kbEmpty: false,
          isBroadQuery: false,
          keywords: looseWords,
        };
      }
    }

    return {
      context: '',
      items: [],
      hasRelevantContent: false,
      kbEmpty: false,
      isBroadQuery: false,
      keywords,
    };
  }

  // En iyi eşleşmeyi al — çok zayıf tek kelime eşleşmelerini reddet
  const top = ranked[0];
  const topHaystack = `${top.item.title} ${top.item.content} ${top.item.category || ''}`.toLowerCase();
  const strongMatch =
    top.score >= 2 ||
    keywords.some((kw) => kw.length >= 4 && haystackMatchesKeyword(topHaystack, kw));

  if (!strongMatch) {
    return {
      context: '',
      items: [],
      hasRelevantContent: false,
      kbEmpty: false,
      isBroadQuery: false,
      keywords,
    };
  }

  const selected = [top.item];

  let context = selected
    .map((k) => `### ${k.title}\n${k.content}`)
    .join('\n\n');

  if (context.length > config.ai.maxKnowledgeChars) {
    context = context.slice(0, config.ai.maxKnowledgeChars) + '\n...[kısaltıldı]';
  }

  return {
    context,
    items: selected,
    hasRelevantContent: selected.length > 0,
    kbEmpty: false,
    isBroadQuery: false,
    keywords,
  };
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

  if (/randevu|rezervasyon|appointment|müsait|musait|uygun saat|boş saat|bos saat|tarih al|saat al|görüşme|gorusme/.test(msg)) {
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