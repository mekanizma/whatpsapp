/**
 * AI prompt birleştirme — admin panelden yönetilen şablonlar
 */

import { Company } from '../types';
import { TRANSFER_MARKER } from './system-prompt';
import { ConversationLang, getLanguagePromptBlock, LANG_NAMES } from './language.service';
import { getPromptContent, getExtensionPromptContents, renderPromptTemplate } from '../services/prompt.service';

export async function buildAppointmentOnlyPrompt(
  company: Company,
  knowledge: string,
  appointmentContext: string,
  collectedContext = '',
  lang: ConversationLang = 'tr'
): Promise<string> {
  const hasKb = knowledge.trim().length > 0;
  const languageBlock = await getLanguagePromptBlock(lang);

  const [systemTemplate, appointmentTemplate] = await Promise.all([
    getPromptContent('system'),
    getPromptContent('appointment'),
  ]);

  const sharedVars: Record<string, string> = {
    companyName: company.company_name,
    category: company.category || '-',
    transferMarker: TRANSFER_MARKER,
    appointmentContext: appointmentContext || 'Takvim bilgisi yok.',
    kbEmptySuffix: hasKb ? '' : ' (BOŞ)',
    knowledge: hasKb ? knowledge : 'Kayıt yok.',
    collectedContext: collectedContext ? `${collectedContext}\n` : '',
    languageBlock,
    langName: LANG_NAMES[lang],
  };

  const parts: string[] = [];

  if (systemTemplate.trim()) {
    parts.push(renderPromptTemplate(systemTemplate, sharedVars));
  }

  if (appointmentTemplate.trim()) {
    parts.push(
      renderPromptTemplate(appointmentTemplate, {
        ...sharedVars,
        appointmentContext: appointmentContext || 'Yok',
        kbEmptySuffix: hasKb ? '' : ' (boş)',
        knowledge: hasKb ? knowledge : 'Kayıt yok.',
      })
    );
  }

  const extensions = await getExtensionPromptContents();
  if (extensions.length > 0) {
    parts.push(
      `--- EK PROMPT KURALLARI ---\n${extensions.map((e) => renderPromptTemplate(e, sharedVars)).join('\n\n')}`
    );
  }

  const dataContext = [
    collectedContext.trim(),
    appointmentContext ? `TAKVİM:\n${appointmentContext}` : '',
  ].filter(Boolean);

  if (dataContext.length > 0) {
    parts.push(dataContext.join('\n\n'));
  }

  return parts.join('\n\n');
}
