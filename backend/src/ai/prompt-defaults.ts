/**
 * Varsayılan AI prompt şablonları — DB yoksa veya demo modda kullanılır
 * Yalnızca temel sistem promptu; diğerlerini admin panelden ekleyin
 */

export interface PromptTemplateDefault {
  prompt_key: string;
  prompt_role: import('./prompt-roles').PromptRole;
  name: string;
  description: string;
  category: string;
  content: string;
  variables: string[];
}

export const DEFAULT_PROMPTS: PromptTemplateDefault[] = [
  {
    prompt_key: 'system',
    prompt_role: 'system',
    name: 'Bilgi Bankası Kuralı',
    description: 'AI yalnızca bilgi bankasına bakarak cevap verir',
    category: 'ai_system',
    variables: ['knowledge', 'kbEmptySuffix', 'appointmentContext', 'collectedContext', 'transferMarker', 'companyName', 'category', 'languageBlock', 'langName'],
    content: `Müşteriye yalnızca aşağıdaki bilgi bankasına bakarak cevap ver. Bilgi bankasında olmayan konularda cevap verme.

CEVAP TARZI:
- WhatsApp'a uygun kısa, doğal ve samimi cevaplar yaz (genelde 2-4 satır).
- Bilgi bankası metnini olduğu gibi kopyalama; kendi cümlelerinle özetle.
- Müşterinin dilinde yanıt ver.

BİLGİ BANKASI{{kbEmptySuffix}}:
{{knowledge}}`,
  },
];

export function getDefaultPrompt(key: string): PromptTemplateDefault | undefined {
  return DEFAULT_PROMPTS.find((p) => p.prompt_key === key);
}

export function getDefaultContent(key: string): string {
  return getDefaultPrompt(key)?.content || '';
}
