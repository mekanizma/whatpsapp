/**
 * Admin panel promptları — statik sistem (önbellek) + dinamik kullanıcı bağlamı
 */

import { Company } from '../types';
import {
  getAllActivePromptContentsForAI,
  getActivePromptsVersionKey,
  renderPromptTemplate,
} from '../services/prompt.service';
import { ConversationLang, DEFAULT_LANGUAGE_BLOCK_FALLBACK, getLanguageHintName } from './language.service';
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
  knowledgeTitles?: string[];
  appointmentContext?: string;
  collectedContext?: string;
  lang?: ConversationLang;
  languageBlock?: string;
}

const TOPIC_RECALL_INSTRUCTION =
  'Eğer müşterinin sorusu aşağıdaki konu başlıklarından birine açıkça uyuyorsa ama yukarıdaki alıntılarda cevap yoksa, konunun mevcut olduğunu belirt ve detay iste veya temsilciye aktarım teklif et; asla bilgi uydurma.';

function formatTopicTitlesList(titles: string[]): string {
  const unique = [...new Set(titles.map((t) => t.trim()).filter(Boolean))];
  if (!unique.length) return '';

  let joined = '';
  for (const title of unique) {
    const candidate = joined ? `${joined}, ${title}` : title;
    if (candidate.length > 400) break;
    joined = candidate;
  }
  return joined;
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
    langName: getLanguageHintName(lang),
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
    renderPromptTemplate(DEFAULT_LANGUAGE_BLOCK_FALLBACK, {
      langName: getLanguageHintName(lang),
    });
  sections.push(`### Dil\n${langSection}`);

  const knowledge = ctx.knowledge?.trim() || '';
  const titlesList = formatTopicTitlesList(ctx.knowledgeTitles || []);
  const kbParts: string[] = [];
  if (knowledge) kbParts.push(knowledge);
  if (titlesList) {
    kbParts.push(`Mevcut konu başlıkları: ${titlesList}`);
    kbParts.push(TOPIC_RECALL_INSTRUCTION);
  }
  if (kbParts.length) {
    sections.push(`### Bilgi Bankası (bu soruya özel)\n${kbParts.join('\n\n')}`);
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
