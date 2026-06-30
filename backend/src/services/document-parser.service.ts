/**
 * Word, Excel ve PDF dosyalarından metin çıkarma
 */

import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { PDFParse } from 'pdf-parse';

const MAX_EXTRACTED_CHARS = 50_000;

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.xlsx', '.xls']);

export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return '';
  return filename.slice(dot).toLowerCase();
}

export function isAllowedKnowledgeFile(filename: string): boolean {
  return ALLOWED_EXTENSIONS.has(getFileExtension(filename));
}

export function titleFromFilename(filename: string): string {
  const ext = getFileExtension(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;
  return base.replace(/[-_]+/g, ' ').trim() || 'Dosyadan içe aktarılan bilgi';
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncateText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_EXTRACTED_CHARS) {
    return { text, truncated: false };
  }
  return {
    text: `${text.slice(0, MAX_EXTRACTED_CHARS)}\n\n[... içerik kısaltıldı ...]`,
    truncated: true,
  };
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    await parser.destroy();
  }
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

function parseExcel(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) {
      parts.push(`--- ${sheetName} ---\n${csv}`);
    }
  }

  return parts.join('\n\n');
}

export interface ParsedDocument {
  title: string;
  content: string;
  source_filename: string;
  file_type: string;
  truncated: boolean;
  char_count: number;
}

export async function parseKnowledgeDocument(
  buffer: Buffer,
  originalFilename: string
): Promise<ParsedDocument> {
  const ext = getFileExtension(originalFilename);

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error('Desteklenen formatlar: PDF, Word (.docx), Excel (.xlsx, .xls)');
  }

  let raw = '';

  switch (ext) {
    case '.pdf':
      raw = await parsePdf(buffer);
      break;
    case '.docx':
      raw = await parseDocx(buffer);
      break;
    case '.xlsx':
    case '.xls':
      raw = parseExcel(buffer);
      break;
    default:
      throw new Error('Desteklenmeyen dosya türü');
  }

  const normalized = normalizeText(raw);
  if (!normalized) {
    throw new Error('Dosyadan okunabilir metin çıkarılamadı. Dosyanın metin içerdiğinden emin olun.');
  }

  const { text, truncated } = truncateText(normalized);

  return {
    title: titleFromFilename(originalFilename),
    content: text,
    source_filename: originalFilename,
    file_type: ext.replace('.', '').toUpperCase(),
    truncated,
    char_count: text.length,
  };
}
