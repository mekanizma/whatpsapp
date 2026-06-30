/**
 * Randevu odaklı AI prompt — admin panelden yönetilen şablon
 */

import { TRANSFER_MARKER } from './system-prompt';
import { ConversationLang, getLanguagePromptBlock } from './language.service';
import { getPromptContent, renderPromptTemplate } from '../services/prompt.service';

export async function buildAppointmentOnlyPrompt(
  knowledge: string,
  appointmentContext: string,
  collectedContext = '',
  lang: ConversationLang = 'tr'
): Promise<string> {
  const hasKb = knowledge.trim().length > 0;
  const template = await getPromptContent('appointment');
  const languageBlock = await getLanguagePromptBlock(lang);

  return renderPromptTemplate(template, {
    collectedContext: collectedContext ? `${collectedContext}\n` : '',
    appointmentContext: appointmentContext || 'Yok',
    kbEmptySuffix: hasKb ? '' : ' (boş)',
    knowledge: hasKb ? knowledge : `Çalışma saati yok — saat önerme, ${TRANSFER_MARKER}`,
    languageBlock,
  });
}
