/**
 * Varsayılan AI prompt şablonları — boş; kurallar admin panelden yazılır
 */

import {
  HANDOFF_PROMPT_CONTENT,
  HANDOFF_PROMPT_KEY,
  HANDOFF_PROMPT_VARIABLES,
} from './handoff-prompt';

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
  {
    prompt_key: HANDOFF_PROMPT_KEY,
    prompt_role: 'custom',
    name: 'Handoff to Live Agent',
    description: 'English rules — works for Turkish and all customer languages',
    category: 'custom',
    variables: HANDOFF_PROMPT_VARIABLES,
    content: HANDOFF_PROMPT_CONTENT,
  },
];

export function getDefaultPrompt(key: string): PromptTemplateDefault | undefined {
  return DEFAULT_PROMPTS.find((p) => p.prompt_key === key);
}

export function getDefaultContent(key: string): string {
  return getDefaultPrompt(key)?.content || '';
}
