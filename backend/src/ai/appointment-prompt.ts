/**
 * Randevu odaklı AI prompt — admin panelden yönetilen system + appointment şablonları
 */

import { Company } from '../types';
import { TRANSFER_MARKER } from './system-prompt';
import { ConversationLang, getLanguagePromptBlock } from './language.service';
import { getPromptContent, renderPromptTemplate } from '../services/prompt.service';

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

  const systemPart = renderPromptTemplate(systemTemplate, {
    companyName: company.company_name,
    category: company.category || '-',
    transferMarker: TRANSFER_MARKER,
    appointmentContext: appointmentContext || 'Takvim bilgisi yok.',
    kbEmptySuffix: hasKb ? '' : ' (BOŞ — bilgi verme, temsilciye aktar)',
    knowledge: hasKb
      ? knowledge
      : 'Kayıt yok. Müşteriye bilgi bankası dışında hiçbir bilgi verme.',
  });

  const appointmentPart = renderPromptTemplate(appointmentTemplate, {
    collectedContext: collectedContext ? `${collectedContext}\n` : '',
    appointmentContext: appointmentContext || 'Yok',
    kbEmptySuffix: hasKb ? '' : ' (boş)',
    knowledge: hasKb ? knowledge : `Çalışma saati yok — saat önerme, ${TRANSFER_MARKER}`,
    languageBlock,
    transferMarker: TRANSFER_MARKER,
  });

  return `${systemPart}\n\n${appointmentPart}`;
}
