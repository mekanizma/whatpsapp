/**
 * Varsayılan AI prompt şablonları — boş; kurallar admin panelden yazılır
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
    name: 'Sistem Promptu',
    description: 'Boş bırakılabilir — admin panelden istediğinizi yazın',
    category: 'ai_system',
    variables: ['companyName', 'category'],
    content: '',
  },
];

export function getDefaultPrompt(key: string): PromptTemplateDefault | undefined {
  return DEFAULT_PROMPTS.find((p) => p.prompt_key === key);
}

export function getDefaultContent(key: string): string {
  return getDefaultPrompt(key)?.content || '';
}
