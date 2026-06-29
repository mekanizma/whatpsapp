/**
 * Bilgi bankası filtreleme — yalnızca ilgili içerik OpenAI'ya gönderilir
 * Tüm KB yerine keyword eşleşmesi ile token tasarrufu
 */

import { KnowledgeItem } from '../types';
import { config } from '../config';

const STOP_WORDS = new Set([
  'bir', 've', 'ile', 'için', 'mi', 'mı', 'mu', 'mü', 'ne', 'nasıl',
  'kaç', 'var', 'yok', 'bu', 'şu', 'de', 'da', 'ki', 'ben', 'siz',
]);

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
): string {
  if (!items.length) {
    return 'Bilgi bankası boş. Şirket bilgilerine dayanarak genel ve yardımcı cevaplar ver; müşteri temsilcisine yönlendirme yapma.';
  }

  const keywords = extractKeywords(customerMessage);

  let selected: KnowledgeItem[];

  if (keywords.length === 0) {
    // Anahtar kelime yoksa sadece ilk 2 madde (token tasarrufu)
    selected = items.slice(0, 2);
  } else {
    selected = items
      .map((item) => ({ item, score: scoreItem(item, keywords) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, config.ai.maxKnowledgeItems)
      .map((x) => x.item);

    // Eşleşme yoksa en genel 2 madde
    if (!selected.length) {
      selected = items.slice(0, 2);
    }
  }

  let context = selected
    .map((k) => `### ${k.title}\n${k.content}`)
    .join('\n\n');

  // Karakter sınırı — token patlamasını önler
  if (context.length > config.ai.maxKnowledgeChars) {
    context = context.slice(0, config.ai.maxKnowledgeChars) + '\n...[kısaltıldı]';
  }

  return context;
}
