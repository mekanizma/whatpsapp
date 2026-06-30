/**
 * Bilgi bankası filtreleme — yalnızca ilgili içerik seçilir
 */

import { KnowledgeItem } from '../types';
import { config } from '../config';

const STOP_WORDS = new Set([
  'bir', 've', 'ile', 'için', 'icin', 'mi', 'mı', 'mu', 'mü', 'ne', 'nasıl', 'nasil',
  'kaç', 'kac', 'var', 'yok', 'bu', 'şu', 'de', 'da', 'ki', 'ben', 'siz', 'verin',
  'ver', 'bilgi', 'hakkinda', 'hakkında', 'hakkinda', 'klinik', 'kliniğiniz', 'kliniginiz',
  'about', 'your', 'tell', 'give', 'information', 'clinic',
]);

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
    if (haystack.includes(kw)) score += kw.length > 4 ? 2 : 1;
  }
  return score;
}

export function filterRelevantKnowledge(
  items: KnowledgeItem[],
  customerMessage: string
): KnowledgeFilterResult {
  const keywords = extractKeywords(customerMessage);
  const broad = isBroadKnowledgeQuery(customerMessage);

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
    return {
      context: '',
      items: [],
      hasRelevantContent: false,
      kbEmpty: false,
      isBroadQuery: false,
      keywords,
    };
  }

  const topScore = ranked[0].score;
  const minScore = Math.max(2, Math.ceil(topScore * 0.45));
  const selected = ranked
    .filter((x) => x.score >= minScore)
    .slice(0, 1)
    .map((x) => x.item);

  let context = selected
    .map((k) => `### ${k.title}\n${k.content}`)
    .join('\n\n');

  if (context.length > config.ai.maxKnowledgeChars) {
    context = context.slice(0, config.ai.maxKnowledgeChars) + '\n...[kısaltıldı]';
  }

  return {
    context,
    items: selected,
    hasRelevantContent: true,
    kbEmpty: false,
    isBroadQuery: false,
    keywords,
  };
}

/** Randevu süreci — bilgi bankası eşleşmesi olmasa da AI devreye girebilir */
export function isAppointmentIntent(
  message: string,
  history: { sender_type: string; message: string }[] = []
): boolean {
  const historyTexts = history.map((m) => m.message);
  const combined = [message, ...historyTexts].join(' ').toLowerCase();

  if (/randevu|rezervasyon|appointment|müsait|musait|uygun saat|boş saat|bos saat|tarih al|saat al|görüşme|gorusme/.test(combined)) {
    return true;
  }

  const recent = history.slice(-8);
  const aiAskedAppointment = recent.some(
    (m) => m.sender_type === 'ai' && /randevu|ad soyad|cep telefon|işlem|doktor|tarih|saat|onay/.test(m.message.toLowerCase())
  );
  const customerReplying = /^(evet|hayır|hayir|tamam|onay|ok|olur|uygun|[\p{L}\s]{2,})$/iu.test(message.trim());

  return aiAskedAppointment && (customerReplying || message.trim().length < 80);
}