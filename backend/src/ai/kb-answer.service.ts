/**
 * Bilgi bankasından kısa, konuya özel yanıt — gereksiz içerik dökülmez
 */

import OpenAI from 'openai';
import { config } from '../config';
import { KnowledgeItem } from '../types';
import { ConversationLang, LANG_NAMES, t } from './language.service';
import { extractKeywords } from './knowledge-filter.service';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

function truncateSmart(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const cut = trimmed.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trim()}…`;
}

/** FAQ / paragraf bloklarından soruya en uygun kısmı çıkar */
export function extractRelevantSnippet(
  content: string,
  keywords: string[],
  maxChars: number
): string {
  const blocks = content.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length === 0) return '';

  if (blocks.length === 1 && blocks[0].includes('\n')) {
    const lines = blocks[0].split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 2 && keywords.length > 0) {
      const matched = lines.filter((line) =>
        keywords.some((kw) => line.toLowerCase().includes(kw))
      );
      if (matched.length > 0) {
        return truncateSmart(matched.join('\n'), maxChars);
      }
    }
  }

  if (blocks.length === 1) {
    return truncateSmart(blocks[0], maxChars);
  }

  const scored = blocks
    .map((block) => {
      const lower = block.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (lower.includes(kw)) score += kw.length > 4 ? 2 : 1;
      }
      return { block, score };
    })
    .sort((a, b) => b.score - a.score);

  const relevant = scored.filter((s) => s.score > 0);
  if (relevant.length === 0) {
    return truncateSmart(blocks[0], maxChars);
  }

  let result = '';
  for (const { block } of relevant) {
    const next = result ? `${result}\n\n${block}` : block;
    if (next.length > maxChars) {
      if (!result) return truncateSmart(block, maxChars);
      break;
    }
    result = next;
  }
  return result || truncateSmart(relevant[0].block, maxChars);
}

/** Genel soruda konu menüsü — tüm KB içeriği dökülmez */
export function buildKnowledgeTopicMenu(
  items: KnowledgeItem[],
  lang: ConversationLang
): string {
  const titles = items.map((k) => k.title?.trim()).filter(Boolean) as string[];
  const unique = [...new Set(titles)];
  const list = unique.slice(0, 8).map((title) => `• ${title}`).join('\n');
  return `${t(lang, 'kb_topic_intro')}\n\n${list}`;
}

/** Tek KB kaydından kısa yanıt */
function formatSingleItemAnswer(
  item: KnowledgeItem,
  keywords: string[],
  maxChars: number
): string {
  const snippet = extractRelevantSnippet(item.content.trim(), keywords, maxChars);
  if (!snippet) return item.title ? `**${item.title}**` : '';

  const titleLower = (item.title || '').toLowerCase();
  const snippetAlreadyHasTitle =
    titleLower && snippet.toLowerCase().includes(titleLower.slice(0, 8));

  if (item.title && !snippetAlreadyHasTitle && snippet.length < maxChars - 30) {
    return `**${item.title}**\n${snippet}`;
  }
  return snippet;
}

/** Müşteri sorusuna göre kısa KB yanıtı */
export function formatConciseKnowledgeAnswer(
  items: KnowledgeItem[],
  customerMessage: string,
  options?: { isBroadQuery?: boolean; lang?: ConversationLang }
): string {
  const lang = options?.lang || 'tr';
  const maxChars = config.ai.maxKbAnswerChars;

  if (options?.isBroadQuery) {
    return buildKnowledgeTopicMenu(items, lang);
  }

  if (items.length === 0) return '';

  const keywords = extractKeywords(customerMessage);
  if (items.length === 1) {
    return formatSingleItemAnswer(items[0], keywords, maxChars);
  }

  const parts = items
    .slice(0, 1)
    .map((k) => formatSingleItemAnswer(k, keywords, maxChars))
    .filter(Boolean);

  return parts.join('\n\n');
}

/** @deprecated formatConciseKnowledgeAnswer kullanın */
export function formatKnowledgeOnlyAnswer(items: KnowledgeItem[]): string {
  return formatConciseKnowledgeAnswer(items, '', { isBroadQuery: false });
}

/** KB metnini müşterinin diline çevir — içerik değiştirilmez, yalnızca dil */
export async function localizeKnowledgeAnswer(
  text: string,
  lang: ConversationLang
): Promise<string> {
  if (!text || lang === 'tr') return text;

  const completion = await openai.chat.completions.create({
    model: config.openai.model,
    temperature: 0,
    max_tokens: 500,
    messages: [
      {
        role: 'system',
        content: `Translate the following customer support text to ${LANG_NAMES[lang]}. Keep it concise. Do not add information. Output ONLY the translation.`,
      },
      { role: 'user', content: text },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() || text;
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
