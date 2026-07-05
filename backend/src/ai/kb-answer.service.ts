/**
 * Bilgi bankasından kısa yanıt — tam içerik LLM'e bırakılır (lexical satır seçimi yok)
 */

import { KnowledgeItem } from '../types';
import { config } from '../config';
import { ConversationLang, LANG_NAMES, t, detectConversationLanguage } from './language.service';
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

/** @deprecated LLM bağlamdan seçer; geriye uyumluluk için tam içerik döner */
export function extractRelevantSnippet(
  content: string,
  _keywords: string[],
  maxChars: number,
  _options?: { priceQuery?: boolean; customerMessage?: string }
): string {
  return truncateSmart(content, maxChars);
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

function formatItemContent(item: KnowledgeItem, maxChars: number): string {
  const body = truncateSmart(item.content.trim(), maxChars);
  if (!body) return item.title ? `**${item.title}**` : '';

  const titleLower = (item.title || '').toLowerCase();
  const bodyHasTitle = titleLower && body.toLowerCase().includes(titleLower.slice(0, 8));

  if (item.title && !bodyHasTitle && body.length < maxChars - 30) {
    return `**${item.title}**\n${body}`;
  }
  return body;
}

/** Müşteri sorusuna göre kısa KB yanıtı — lexical satır seçimi yapılmaz */
export function formatConciseKnowledgeAnswer(
  items: KnowledgeItem[],
  _customerMessage: string,
  options?: { isBroadQuery?: boolean; lang?: ConversationLang }
): string {
  const lang = options?.lang || 'tr';
  const maxChars = config.ai.maxKbAnswerChars;

  if (options?.isBroadQuery) {
    return buildKnowledgeTopicMenu(items, lang);
  }

  if (items.length === 0) return '';

  const parts = items
    .slice(0, config.rag.topK)
    .map((k) => formatItemContent(k, maxChars))
    .filter(Boolean);

  return parts.join('\n\n');
}

/** @deprecated formatConciseKnowledgeAnswer kullanın */
export function formatKnowledgeOnlyAnswer(items: KnowledgeItem[]): string {
  return formatConciseKnowledgeAnswer(items, '', { isBroadQuery: false });
}

/** Eşleşme yokken tam KB dökmek yerine başlık listesi + talimat */
export function buildKnowledgeNoMatchHint(
  items: KnowledgeItem[],
  lang: ConversationLang = 'tr'
): string {
  if (!items.length) return '';

  const titles = [...new Set(items.map((k) => k.title?.trim()).filter(Boolean))] as string[];
  let list = titles.map((title) => `• ${title}`).join('\n');
  if (list.length > 400) {
    list = `${list.slice(0, 397)}…`;
  }

  const instruction = t(lang, 'kb_miss_instruction');
  return list ? `${instruction}\n\n${t(lang, 'kb_topics_header')}\n${list}` : instruction;
}

/** KB metnini müşterinin diline çevir — içerik değiştirilmez, yalnızca dil */
export async function localizeKnowledgeAnswer(
  text: string,
  lang: ConversationLang
): Promise<string> {
  if (!text) return text;
  if (lang === 'other') return text;

  const sourceLang = detectConversationLanguage(text, []);
  if (sourceLang === lang || sourceLang === 'other') return text;

  const translatePrompt = await getPromptContent('kb_translate');
  const systemContent = translatePrompt.trim()
    ? renderPromptTemplate(translatePrompt, { langName: LANG_NAMES[lang] })
    : `Translate the following customer support text to ${LANG_NAMES[lang]}. Keep it concise. Do not add information. Output ONLY the translation.`;

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
