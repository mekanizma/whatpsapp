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

export function haystackMatchesKeyword(haystack: string, keyword: string): boolean {
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

const PRICE_QUERY_RE =
  /fiyat|ücret|ucret|ne kadar|kaç tl|kac tl|kaça|kaca|\btl\b|₺|eur|euro|\$|price|prices|pricing|cost|costs|fee|fees|tuition|how much|tariff|tarife|preis|preise|prix|tarif|ücretlendirme|ucretlendirme/i;

const GENERAL_PRICE_LIST_RE =
  /fiyatlar|fiyat list|ücretler|ucretler|fiyatlarınız|fiyatlariniz|fiyat bilgi|ücret bilgi|fiyatlariniz nedir|ücretleriniz|ucretleriniz|your prices|about your prices|price list|pricing information|our prices|what are your prices|information about (your )?prices|your fees|fee schedule|tuition fees|cost of|how much (do|does|is|are)/i;

const DURATION_QUERY_RE =
  /ne kadar sür|surer|süre|sure|kaç seans|kac seans|kaç dakika|kac dakika|ne zaman biter|how long|how many sessions|how many minutes|how much time|takes how long|duration of|how many hours/i;

/** Genel / belirsiz bilgi talebi — query rewrite LLM is_broad bayrağından gelir */
export function isBroadKnowledgeQuery(isBroad = false): boolean {
  return isBroad;
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

/** Fiyat / ücret sorusu (süre sorusu değil) */
export function isPriceQuery(message: string): boolean {
  const n = message.toLowerCase();
  if (DURATION_QUERY_RE.test(n)) return false;
  return PRICE_QUERY_RE.test(n);
}

/** Genel fiyat listesi talebi */
export function isGeneralPriceListQuery(message: string): boolean {
  return GENERAL_PRICE_LIST_RE.test(message.toLowerCase());
}

function isPriceKnowledgeItem(item: KnowledgeItem): boolean {
  const meta = `${item.title} ${item.category || ''}`.toLowerCase();
  return /fiyat|ücret|ucret|price/.test(meta) || /\d+\s*(tl|₺|try)/i.test(item.content);
}

/** Soru cümlesi — randevu adımında isim sanılmasını önlemek için (domain-bağımsız) */
export function isKnowledgeQuestion(message: string): boolean {
  const n = message.toLowerCase().trim();
  return (
    /[?？]/.test(n) ||
    /\b(what|how|when|where|which|who|why|nedir|nasıl|nasil|ne kadar|kaç|kac|nerede|hangi|var mı|varmi|bilgi)\b/.test(
      n
    )
  );
}

function looksLikeQuestion(message: string): boolean {
  return isKnowledgeQuestion(message);
}

function hasAppointmentSignals(message: string): boolean {
  const msg = message.toLowerCase();
  return /randevu|rezervasyon|appointment|müsait|musait|uygun saat|boş saat|bos saat|tarih al|saat al|görüşme|gorusme|alabilir\s*miyim|alabilirmiyim|almak istiyorum/.test(
    msg
  );
}

export function filterRelevantKnowledge(
  items: KnowledgeItem[],
  customerMessage: string,
  options?: { isBroad?: boolean }
): KnowledgeFilterResult {
  const keywords = extractKeywords(customerMessage);
  const broad = isBroadKnowledgeQuery(options?.isBroad ?? false);

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

  if (isGeneralPriceListQuery(customerMessage)) {
    const priceItem = items.find(isPriceKnowledgeItem);
    if (priceItem) {
      const context = `### ${priceItem.title}\n${priceItem.content}`;
      return {
        context: context.slice(0, config.ai.maxKnowledgeChars),
        items: [priceItem],
        hasRelevantContent: true,
        kbEmpty: false,
        isBroadQuery: false,
        keywords,
      };
    }
  }

  const searchPool =
    isPriceQuery(customerMessage) && items.some(isPriceKnowledgeItem)
      ? items.filter(isPriceKnowledgeItem)
      : items;

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

  const ranked = searchPool
    .map((item) => {
      let score = scoreItem(item, keywords);
      if (isPriceQuery(customerMessage) && isPriceKnowledgeItem(item)) score += 5;
      return { item, score };
    })
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

/** AI'ya verilecek bilgi bankası bağlamı — genel sorularda tam içerik */
export function buildKnowledgeContextForAI(
  kbFilter: KnowledgeFilterResult,
  allItems: KnowledgeItem[],
  customerMessage: string
): string {
  if (kbFilter.isBroadQuery && allItems.length > 0) {
    const full = allItems.map((k) => `### ${k.title}\n${k.content}`).join('\n\n');
    return full.length > config.ai.maxKnowledgeChars
      ? `${full.slice(0, config.ai.maxKnowledgeChars)}\n...[kısaltıldı]`
      : full;
  }

  if (kbFilter.context.trim()) {
    return kbFilter.context;
  }

  return '';
}

/** Admin promptunda KB yazılmasa bile her AI çağrısına eklenir */
export function buildMandatoryKnowledgeContext(
  allItems: KnowledgeItem[],
  customerMessage: string,
  kbFilter: KnowledgeFilterResult
): string {
  const filtered = buildKnowledgeContextForAI(kbFilter, allItems, customerMessage);
  if (filtered.trim()) return filtered;

  if (!allItems.length) return '';

  const full = allItems.map((k) => `### ${k.title}\n${k.content}`).join('\n\n');
  return full.length > config.ai.maxKnowledgeChars
    ? `${full.slice(0, config.ai.maxKnowledgeChars)}\n...[kısaltıldı]`
    : full;
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

  if (looksLikeQuestion(trimmed)) {
    return false;
  }

  if (hasAppointmentSignals(trimmed)) {
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