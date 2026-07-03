/**
 * FTS token sanitization — mirrors kb_sanitize_fts_token / kb_or_tsquery in Postgres
 */

/** Strip non-alphanumerics, skip tokens shorter than 3 chars (safe for OR tsquery) */
export function sanitizeFtsQueryTokens(text: string): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const tokens: string[] = [];

  for (const word of words) {
    const cleaned = word.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]/gi, '');
    if (cleaned.length >= 3) {
      tokens.push(cleaned);
    }
  }

  return tokens;
}

/** Build OR-joined tsquery string from sanitized tokens only */
export function buildOrTsQueryString(text: string): string {
  return sanitizeFtsQueryTokens(text).join(' | ');
}
