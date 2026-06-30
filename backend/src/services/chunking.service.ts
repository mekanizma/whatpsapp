/**
 * Knowledge base text chunking
 * Markdown: split on ## headings; other formats: recursive character split
 */

import { config } from '../config';

export interface TextChunk {
  index: number;
  heading: string | null;
  content: string;
}

const H2_PATTERN = /^##\s+(.+)$/m;

function formatChunkContent(heading: string | null, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '';
  if (heading) return `Konu: ${heading}\n\n${trimmed}`;
  return trimmed;
}

function splitLargeBody(body: string, chunkSize: number, overlap: number): string[] {
  const paragraphs = body.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return [];

  const parts: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }

    if (`${current}\n\n${paragraph}`.length <= chunkSize) {
      current = `${current}\n\n${paragraph}`;
      continue;
    }

    parts.push(current);
    if (paragraph.length > chunkSize) {
      let start = 0;
      while (start < paragraph.length) {
        const slice = paragraph.slice(start, start + chunkSize);
        parts.push(slice);
        start += Math.max(chunkSize - overlap, 1);
      }
      current = '';
    } else {
      const tail = current.slice(Math.max(0, current.length - overlap));
      current = tail ? `${tail}\n\n${paragraph}` : paragraph;
    }
  }

  if (current.trim()) parts.push(current);
  return parts;
}

export function hasMarkdownH2(text: string): boolean {
  return H2_PATTERN.test(text);
}

export function chunkByMarkdownH2(text: string, docTitle?: string): TextChunk[] {
  const parts = text.split(H2_PATTERN);
  const chunks: TextChunk[] = [];
  let index = 0;

  const preamble = parts[0]?.trim();
  if (preamble) {
    const subParts = splitLargeBody(
      preamble,
      config.rag.chunkSize,
      config.rag.chunkOverlap
    );
    for (const sub of subParts) {
      chunks.push({
        index: index++,
        heading: docTitle || null,
        content: formatChunkContent(docTitle || null, sub),
      });
    }
  }

  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i]?.trim();
    const body = (parts[i + 1] || '').trim();
    if (!heading || !body) continue;

    const subParts = splitLargeBody(body, config.rag.chunkSize, config.rag.chunkOverlap);
    for (const sub of subParts) {
      chunks.push({
        index: index++,
        heading,
        content: formatChunkContent(heading, sub),
      });
    }
  }

  return chunks.filter((c) => c.content.trim().length > 0);
}

export function chunkRecursive(text: string, docTitle?: string): TextChunk[] {
  const parts = splitLargeBody(text.trim(), config.rag.chunkSize, config.rag.chunkOverlap);
  return parts.map((part, index) => ({
    index,
    heading: docTitle || null,
    content: formatChunkContent(docTitle || null, part),
  }));
}

/** Primary entry: ## headings when present, otherwise recursive split */
export function chunkText(text: string, docTitle?: string): TextChunk[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks = hasMarkdownH2(normalized)
    ? chunkByMarkdownH2(normalized, docTitle)
    : chunkRecursive(normalized, docTitle);

  return chunks.filter((c) => c.content.trim().length >= 20);
}
