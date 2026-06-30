/**
 * Bilgi bankası filtreleme — yalnızca ilgili içerik OpenAI'ya gönderilir
 */

import { KnowledgeItem } from '../types';
import { config } from '../config';

const STOP_WORDS = new Set([
  'bir', 've', 'ile', 'için', 'mi', 'mı', 'mu', 'mü', 'ne', 'nasıl',
  'kaç', 'var', 'yok', 'bu', 'şu', 'de', 'da', 'ki', 'ben', 'siz',
]);

export interface KnowledgeFilterResult {
  context: string;
  hasRelevantContent: boolean;
  kbEmpty: boolean;
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\wğüşıöçĞÜŞİÖÇ\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
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
  if (!items.length) {
    return { context: '', hasRelevantContent: false, kbEmpty: true };
  }

  const keywords = extractKeywords(customerMessage);

  let selected: KnowledgeItem[];

  if (keywords.length === 0) {
    selected = [];
  } else {
    selected = items
      .map((item) => ({ item, score: scoreItem(item, keywords) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, config.ai.maxKnowledgeItems)
      .map((x) => x.item);
  }

  if (!selected.length) {
    return { context: '', hasRelevantContent: false, kbEmpty: false };
  }

  let context = selected
    .map((k) => `### ${k.title}\n${k.content}`)
    .join('\n\n');

  if (context.length > config.ai.maxKnowledgeChars) {
    context = context.slice(0, config.ai.maxKnowledgeChars) + '\n...[kısaltıldı]';
  }

  return { context, hasRelevantContent: true, kbEmpty: false };
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
  const recentText = recent.map((m) => m.message).join(' ').toLowerCase();
  const aiAskedAppointment = recent.some(
    (m) => m.sender_type === 'ai' && /randevu|ad soyad|cep telefon|işlem|doktor|tarih|saat|onay/.test(m.message.toLowerCase())
  );
  const customerReplying = /^(evet|hayır|hayir|tamam|onay|ok|olur|uygun|[\p{L}\s]{2,})$/iu.test(message.trim());

  return aiAskedAppointment && (customerReplying || message.trim().length < 80);
}
