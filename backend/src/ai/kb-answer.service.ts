/**
 * Bilgi bankasından kısa, konuya özel yanıt — gereksiz içerik dökülmez
 */

import { KnowledgeItem } from '../types';
import { config } from '../config';
import { ConversationLang, LANG_NAMES, t } from './language.service';
import {
  extractKeywords,
  haystackMatchesKeyword,
  isPriceQuery,
  isGeneralPriceListQuery,
} from './knowledge-filter.service';
import { getPromptContent, renderPromptTemplate } from '../services/prompt.service';
import { createChatCompletion } from './openai-client';

function truncateSmart(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const cut = trimmed.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trim()}…`;
}

function expandPriceKeywords(keywords: string[], message: string): string[] {
  const extra = [...keywords];
  const n = message.toLowerCase();
  if (/taş|tas/.test(n) && /temiz/.test(n)) {
    extra.push('temizlik', 'temizliği', 'temizligi');
  }
  if (/çekim|cekim/.test(n)) extra.push('çekim', 'cekim', 'çekimi', 'cekim');
  return [...new Set(extra)];
}

/** Fiyat listesinden ilgili satırı çıkar */
function extractPriceLineAnswer(
  content: string,
  keywords: string[],
  message: string,
  maxChars: number
): string {
  const expanded = expandPriceKeywords(keywords, message);
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const priceLines = lines.filter((l) => /\d+\s*(tl|₺|try)/i.test(l));

  if (priceLines.length === 0) {
    return truncateSmart(content, maxChars);
  }

  if (isGeneralPriceListQuery(message)) {
    return truncateSmart(priceLines.join('\n'), maxChars);
  }

  const scored = priceLines
    .map((line) => {
      const lower = line.toLowerCase();
      let score = 0;
      for (const kw of expanded) {
        if (haystackMatchesKeyword(lower, kw)) score += kw.length > 4 ? 2 : 1;
      }
      return { line, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    return scored[0].line;
  }

  return truncateSmart(priceLines.join('\n'), maxChars);
}

/** FAQ / paragraf bloklarından soruya en uygun TEK kısmı çıkar */
export function extractRelevantSnippet(
  content: string,
  keywords: string[],
  maxChars: number,
  options?: { priceQuery?: boolean; customerMessage?: string }
): string {
  const priceQuery = options?.priceQuery ?? false;
  const message = options?.customerMessage ?? '';

  if (priceQuery || (message && isPriceQuery(message))) {
    const priceAnswer = extractPriceLineAnswer(content, keywords, message, maxChars);
    if (priceAnswer) return priceAnswer;
  }

  const blocks = content.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length === 0) return '';

  if (blocks.length === 1 && blocks[0].includes('\n')) {
    const lines = blocks[0].split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 2 && keywords.length > 0) {
      const scoredPairs: { text: string; score: number }[] = [];
      for (let i = 0; i < lines.length - 1; i++) {
        const q = lines[i];
        const a = lines[i + 1];
        if (!q.includes('?') || !a || a.endsWith('?')) continue;
        const combined = `${q}\n${a}`.toLowerCase();
        let score = 0;
        for (const kw of keywords) {
          if (haystackMatchesKeyword(combined, kw)) score += 1;
        }
        if (score > 0) scoredPairs.push({ text: `${q}\n\n${a}`, score });
      }
      scoredPairs.sort((a, b) => b.score - a.score);
      if (scoredPairs.length > 0) {
        return truncateSmart(scoredPairs[0].text, maxChars);
      }
    }
  }

  if (blocks.length === 1) {
    return truncateSmart(blocks[0], maxChars);
  }

  const mergedBlocks: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const curr = blocks[i];
    const next = blocks[i + 1];
    if (curr.endsWith('?') && next && !next.endsWith('?')) {
      mergedBlocks.push(`${curr}\n\n${next}`);
      i++;
    } else {
      mergedBlocks.push(curr);
    }
  }

  const scored = mergedBlocks
    .map((block) => {
      const lower = block.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (haystackMatchesKeyword(lower, kw)) score += kw.length > 4 ? 2 : 1;
      }
      if (priceQuery && /\d+\s*(tl|₺|try)/i.test(block)) score += 3;
      if (priceQuery && /ne kadar sür|süre|sure|seans/.test(lower)) score -= 2;
      return { block, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score <= 0) {
    return truncateSmart(blocks[0], maxChars);
  }

  return truncateSmart(best.block, maxChars);
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
  maxChars: number,
  customerMessage: string
): string {
  const priceQuery = isPriceQuery(customerMessage);
  const snippet = extractRelevantSnippet(item.content.trim(), keywords, maxChars, {
    priceQuery,
    customerMessage,
  });
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
    return formatSingleItemAnswer(items[0], keywords, maxChars, customerMessage);
  }

  const parts = items
    .slice(0, 1)
    .map((k) => formatSingleItemAnswer(k, keywords, maxChars, customerMessage))
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

  const translatePrompt = await getPromptContent('kb_translate');
  const systemContent = renderPromptTemplate(translatePrompt, { langName: LANG_NAMES[lang] });

  const completion = await createChatCompletion(
    [
      { role: 'system', content: systemContent },
      { role: 'user', content: text },
    ],
    { maxTokens: 500, temperature: 0 }
  );

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
