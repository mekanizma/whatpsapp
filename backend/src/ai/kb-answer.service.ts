/**
 * Bilgi bankasından doğrudan yanıt — OpenAI kullanmadan, %100 KB içeriği
 */

import { KnowledgeItem } from '../types';

export function formatKnowledgeOnlyAnswer(items: KnowledgeItem[]): string {
  if (items.length === 0) return '';

  if (items.length === 1) {
    const k = items[0];
    const header = k.title ? `${k.title}\n\n` : '';
    return `${header}${k.content.trim()}`;
  }

  return items
    .map((k) => {
      const title = k.title ? `**${k.title}**\n` : '';
      return `${title}${k.content.trim()}`;
    })
    .join('\n\n');
}

/** Yanıt yalnızca bilgi bankası metninden mi oluşuyor — basit kontrol */
export function isResponseGroundedInKnowledge(response: string, kbText: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const r = norm(response);
  const kb = norm(kbText);
  if (!r || !kb) return false;

  const words = r.split(' ').filter((w) => w.length > 4);
  if (words.length === 0) return true;

  let grounded = 0;
  for (const w of words) {
    if (kb.includes(w)) grounded++;
  }
  return grounded / words.length >= 0.55;
}
