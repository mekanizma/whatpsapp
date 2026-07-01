/**
 * Extract human-readable message from API / thrown errors
 */

export function getErrorMessage(error: unknown, fallback = 'Beklenmeyen bir hata oluştu'): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim()) return record.message;
    if (typeof record.error === 'string' && record.error.trim()) return record.error;
  }
  return fallback;
}
