/**
 * Admin panel promptları — statik sistem (önbellek) + dinamik kullanıcı bağlamı
 */

import { Company } from '../types';
import {
  getAllActivePromptContentsForAI,
  getActivePromptsVersionKey,
  renderPromptTemplate,
} from '../services/prompt.service';
import { ConversationLang, LANG_NAMES } from './language.service';
import { TRANSFER_MARKER } from './system-prompt';

export interface AdminPromptContext {
  knowledge?: string;
  appointmentContext?: string;
  collectedContext?: string;
  lang?: ConversationLang;
  appointmentMode?: boolean;
}

export interface DynamicPromptContext {
  knowledge?: string;
  appointmentContext?: string;
  collectedContext?: string;
  lang?: ConversationLang;
  languageBlock?: string;
}

/** Ana sistem promptuna dahil edilmeyen roller */
const NON_CHAT_ROLES = new Set(['greeting', 'translation']);

/**
 * Dinamik değişkenler — statik promptta kararlı yer tutucu metin.
 * OpenAI prompt önbelleği için system prefix bayt-düzeyinde aynı kalmalı.
 */
const STATIC_DYNAMIC_PLACEHOLDERS: Record<string, string> = {
  knowledge: '(see the "Bilgi Bankası" section in the user message)',
  appointmentContext: '(see the "Randevu Bağlamı" section in the user message)',
  collectedContext: '(see the "Toplanan Randevu Bilgileri" section in the user message)',
  langName: '(see the "Dil" section in the user message)',
  languageBlock: '',
  kbEmptySuffix: '',
};

const staticPromptCache = new Map<string, string>();

export function invalidateStaticSystemPromptCache(companyId?: string): void {
  if (!companyId) {
    staticPromptCache.clear();
    return;
  }
  for (const key of staticPromptCache.keys()) {
    if (key.startsWith(`${companyId}:`)) {
      staticPromptCache.delete(key);
    }
  }
}

function buildStaticTemplateVars(company: Company): Record<string, string> {
  return {
    companyName: company.company_name,
    category: company.category || '',
    transferMarker: TRANSFER_MARKER,
    ...STATIC_DYNAMIC_PLACEHOLDERS,
  };
}

async function renderStaticSystemPrompt(company: Company): Promise<string> {
  const activePrompts = await getAllActivePromptContentsForAI();
  const vars = buildStaticTemplateVars(company);

  const parts = activePrompts
    .filter((p) => !NON_CHAT_ROLES.has(p.prompt_role))
    .map((p) => renderPromptTemplate(p.content, vars))
    .filter((text) => text.trim());

  return parts.join('\n\n').trim();
}

/** Şirket + prompt sürümü için önbellekli statik system prompt */
export async function buildStaticSystemPrompt(
  companyId: string,
  company: Company
): Promise<string> {
  const versionKey = await getActivePromptsVersionKey();
  const cacheKey = `${companyId}:${versionKey}`;
  const cached = staticPromptCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const prompt = await renderStaticSystemPrompt(company);
  staticPromptCache.set(cacheKey, prompt);
  return prompt;
}

/** Tur dil talimatı — dinamik kullanıcı mesajının Dil bölümüne eklenir */
export async function buildLanguageBlockForTurn(lang: ConversationLang): Promise<string> {
  const activePrompts = await getAllActivePromptContentsForAI();
  const languagePrompt = activePrompts.find((p) => p.prompt_role === 'language');
  if (!languagePrompt?.content.trim()) return '';

  return renderPromptTemplate(languagePrompt.content, {
    langName: LANG_NAMES[lang],
  });
}

/** RAG / randevu bağlamı + ham müşteri metni — son user mesajı */
export function buildDynamicUserMessage(
  customerMessage: string,
  ctx: DynamicPromptContext
): string {
  const lang = ctx.lang || 'tr';
  const sections: string[] = [];

  const langSection =
    ctx.languageBlock?.trim() ||
    `Müşteri dili: ${LANG_NAMES[lang]}. Yanıtınız yalnızca bu dilde olmalıdır.`;
  sections.push(`### Dil\n${langSection}`);

  const knowledge = ctx.knowledge?.trim() || '';
  if (knowledge) {
    sections.push(`### Bilgi Bankası (bu soruya özel)\n${knowledge}`);
  }

  const appointmentContext = ctx.appointmentContext?.trim() || '';
  if (appointmentContext) {
    sections.push(`### Randevu Bağlamı\n${appointmentContext}`);
  }

  const collectedContext = ctx.collectedContext?.trim() || '';
  if (collectedContext) {
    sections.push(`### Toplanan Randevu Bilgileri\n${collectedContext}`);
  }

  sections.push(`### Müşteri Mesajı\n${customerMessage}`);
  return sections.join('\n\n');
}

/**
 * @deprecated Statik + dinamik ayrımı için buildStaticSystemPrompt + buildDynamicUserMessage kullanın
 */
export async function buildAdminPanelPrompt(
  company: Company,
  ctx: AdminPromptContext = {}
): Promise<string> {
  const lang = ctx.lang || 'tr';
  const languageBlock = await buildLanguageBlockForTurn(lang);
  const staticPrompt = await renderStaticSystemPrompt(company);
  const dynamic = buildDynamicUserMessage('', {
    knowledge: ctx.knowledge,
    appointmentContext: ctx.appointmentContext,
    collectedContext: ctx.collectedContext,
    lang,
    languageBlock,
  });

  if (!staticPrompt && !dynamic.trim()) return '';
  if (!dynamic.trim()) return staticPrompt;
  return `${staticPrompt}\n\n---\n\n${dynamic}`.trim();
}
