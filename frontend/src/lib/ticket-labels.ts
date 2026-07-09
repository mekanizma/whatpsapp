import type { TFunction } from 'i18next';

const SUBJECT_KEY_BY_EN: Record<string, string> = {
  'Live agent request': 'human_transfer_request',
  'Transfer confirmed': 'transfer_confirmed',
  'Frustrated customer': 'customer_frustration',
  'Security — prompt injection': 'prompt_injection',
  'Security — sensitive data': 'sensitive_data',
  'Opt-out request': 'opt_out',
  'AI handoff to agent': 'ai_transfer',
  'Live support request': 'live_support_request',
};

export function getTicketPriorityLabel(t: TFunction, priority: string): string {
  return t(`tickets.priority.${priority}`, { defaultValue: priority });
}

export function getTicketSubjectLabel(t: TFunction, subject: string): string {
  const trimmed = subject.trim();
  if (!trimmed) return t('tickets.subjects.live_support_request');

  const customerMatch = /^Customer:\s*(.+)$/i.exec(trimmed);
  if (customerMatch) {
    return t('tickets.subjectCustomer', { preview: customerMatch[1] });
  }

  const key = SUBJECT_KEY_BY_EN[trimmed];
  if (key) return t(`tickets.subjects.${key}`);

  return trimmed;
}
