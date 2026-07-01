/**
 * Bilgi bankası dosya yardımcıları
 */

export const KNOWLEDGE_ACCEPTED_FILES = '.pdf,.docx,.xlsx,.xls,.md,.txt,.markdown';

const TEXT_FILE_PATTERN = /\.(md|markdown|txt)$/i;

export function isTextKnowledgeFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (TEXT_FILE_PATTERN.test(name)) return true;
  const mime = file.type.toLowerCase();
  return mime.startsWith('text/') || mime.includes('markdown');
}

export function isMarkdownKnowledgeFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (/\.(md|markdown)$/i.test(name)) return true;
  const mime = file.type.toLowerCase();
  return mime.includes('markdown');
}

export function titleFromKnowledgeFilename(filename: string): string {
  const base = filename.replace(TEXT_FILE_PATTERN, '');
  return base.replace(/[-_]+/g, ' ').trim();
}

export function isMarkdownContent(
  content: string,
  sourceFilename?: string | null,
  fileType?: string | null
): boolean {
  if (sourceFilename && /\.(md|markdown)$/i.test(sourceFilename)) return true;
  if (fileType === 'MD' || fileType === 'MARKDOWN') return true;
  return /^#{1,6}\s|^\s*[-*]\s|\*\*|__|\[.+\]\(.+\)/m.test(content);
}
