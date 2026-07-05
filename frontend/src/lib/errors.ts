/**
 * Extract human-readable message from API / thrown errors
 */

import i18n from '@/i18n';

export function getErrorMessage(error: unknown, fallback?: string): string {
  const resolvedFallback = fallback ?? i18n.t('errors.unknown');
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim()) return record.message;
    if (typeof record.error === 'string' && record.error.trim()) return record.error;
  }
  return resolvedFallback;
}
