/**
 * Admin panel promptlarını birleştirir — yalnızca kayıtlı aktif promptlar
 */

import { Company } from '../types';
import {
  getAllActivePromptContentsForAI,
  renderPromptTemplate,
} from '../services/prompt.service';
import { ConversationLang, LANG_NAMES } from './language.service';
import { TRANSFER_MARKER } from './system-prompt';

export interface AdminPromptContext {
  knowledge?: string;
  appointmentContext?: string;
  collectedContext?: string;
  lang?: ConversationLang;
  /** Randevu sürecindeyken appointment rolü promptu devreye girer */
  appointmentMode?: boolean;
}

/** Ana sistem promptuna dahil edilmeyen roller */
const NON_CHAT_ROLES = new Set(['greeting', 'translation']);

export async function buildAdminPanelPrompt(
  company: Company,
  ctx: AdminPromptContext = {}
): Promise<string> {
  const lang = ctx.lang || 'tr';
  const activePrompts = await getAllActivePromptContentsForAI();

  const vars: Record<string, string> = {
    companyName: company.company_name,
    category: company.category || '',
    transferMarker: TRANSFER_MARKER,
    appointmentContext: ctx.appointmentContext || '',
    kbEmptySuffix: '',
    knowledge: ctx.knowledge || '',
    collectedContext: ctx.collectedContext || '',
    languageBlock: '',
    langName: LANG_NAMES[lang],
  };

  const languagePrompt = activePrompts.find((p) => p.prompt_role === 'language');
  if (languagePrompt) {
    vars.languageBlock = renderPromptTemplate(languagePrompt.content, vars);
  }

  const parts = activePrompts
    .filter((p) => {
      if (NON_CHAT_ROLES.has(p.prompt_role)) return false;
      if (p.prompt_role === 'appointment') return ctx.appointmentMode === true;
      return true;
    })
    .map((p) => renderPromptTemplate(p.content, vars))
    .filter((text) => text.trim());

  return parts.join('\n\n').trim();
}
