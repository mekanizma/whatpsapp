/**
 * WhatsApp AI destek asistanı sistem promptu — admin panelden yönetilen şablon
 */

import { Company } from '../types';
import { getPromptContent, renderPromptTemplate } from '../services/prompt.service';

const TRANSFER_MARKER = '[TRANSFER]';

export { TRANSFER_MARKER };

export async function buildSystemPrompt(
  company: Company,
  knowledge: string,
  appointmentContext = ''
): Promise<string> {
  const hasKnowledge = knowledge.trim().length > 0;
  const template = await getPromptContent('system');

  return renderPromptTemplate(template, {
    companyName: company.company_name,
    category: company.category || '-',
    transferMarker: TRANSFER_MARKER,
    appointmentContext: appointmentContext || 'Takvim bilgisi yok.',
    kbEmptySuffix: hasKnowledge ? '' : ' (BOŞ — bilgi verme, temsilciye aktar)',
    knowledge: hasKnowledge
      ? knowledge
      : 'Kayıt yok. Müşteriye bilgi bankası dışında hiçbir bilgi verme.',
  });
}
