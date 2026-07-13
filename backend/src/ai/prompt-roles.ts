/**
 * Prompt rolleri — her rolün AI'daki kullanım yeri
 */

export type PromptRole =
  | 'greeting'
  | 'system'
  | 'appointment'
  | 'language'
  | 'translation'
  | 'custom';

export const CORE_PROMPT_ROLES: PromptRole[] = [
  'greeting',
  'system',
  'appointment',
  'language',
  'translation',
];

/** Eski kod anahtarları → rol eşlemesi */
export const PROMPT_KEY_TO_ROLE: Record<string, PromptRole> = {
  greeting: 'greeting',
  system: 'system',
  appointment: 'appointment',
  language_block: 'language',
  kb_translate: 'translation',
};

export const PROMPT_ROLE_META: Record<
  PromptRole,
  { labelKey: string; descKey: string; variables: string[] }
> = {
  greeting: {
    labelKey: 'admin.prompts.roleGreeting',
    descKey: 'admin.prompts.roleGreetingDesc',
    variables: ['langName'],
  },
  system: {
    labelKey: 'admin.prompts.roleSystem',
    descKey: 'admin.prompts.roleSystemDesc',
    variables: [
      'companyName',
      'category',
      'transferMarker',
      'appointmentContext',
      'kbEmptySuffix',
      'knowledge',
    ],
  },
  appointment: {
    labelKey: 'admin.prompts.roleAppointment',
    descKey: 'admin.prompts.roleAppointmentDesc',
    variables: [
      'collectedContext',
      'appointmentContext',
      'kbEmptySuffix',
      'knowledge',
      'languageBlock',
      'transferMarker',
      'currentDate',
      'currentDayName',
      'currentTime',
    ],
  },
  language: {
    labelKey: 'admin.prompts.roleLanguage',
    descKey: 'admin.prompts.roleLanguageDesc',
    variables: ['langName'],
  },
  translation: {
    labelKey: 'admin.prompts.roleTranslation',
    descKey: 'admin.prompts.roleTranslationDesc',
    variables: ['langName'],
  },
  custom: {
    labelKey: 'admin.prompts.roleCustom',
    descKey: 'admin.prompts.roleCustomDesc',
    variables: [
      'companyName',
      'category',
      'transferMarker',
      'appointmentContext',
      'kbEmptySuffix',
      'knowledge',
      'collectedContext',
      'languageBlock',
      'langName',
    ],
  },
};

export function resolvePromptRole(keyOrRole: string): PromptRole | null {
  if (keyOrRole in PROMPT_ROLE_META) return keyOrRole as PromptRole;
  return PROMPT_KEY_TO_ROLE[keyOrRole] || null;
}

export function roleToLegacyKey(role: PromptRole): string {
  const map: Partial<Record<PromptRole, string>> = {
    language: 'language_block',
    translation: 'kb_translate',
  };
  return map[role] || role;
}
