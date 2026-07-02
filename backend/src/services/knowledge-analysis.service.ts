/**
 * Akıllı bilgi bankası analizi — başlık, kategori, etiket üretimi; içerik orijinal metinden korunur
 */

import { createChatCompletion } from '../ai/openai-client';
import { detectConversationLanguage, LANG_NAMES } from '../ai/language.service';
import { config } from '../config';

export interface AnalyzedKnowledgeEntry {
  title: string;
  category: string;
  tags: string[];
  content: string;
}

export interface KnowledgeAnalysisResult {
  entries: AnalyzedKnowledgeEntry[];
  analyzed: boolean;
  split: boolean;
}

interface MetadataEntry {
  title: string;
  category: string;
  tags: string[];
  start_marker?: string;
}

export const SUGGESTED_CATEGORIES = [
  'Ücretler',
  'Burslar',
  'Konaklama',
  'Başvuru',
  'İletişim',
  'Çalışma Saatleri',
  'Hizmetler',
  'Tedaviler',
  'Doktorlar',
  'Kampüs',
  'Randevu',
  'Genel Bilgiler',
] as const;

function buildAnalysisSystemPrompt(sourceLanguage: string): string {
  return `You analyze documents for a knowledge base. Return JSON only:
{
  "entries": [
    {
      "title": "short professional title",
      "category": "one category name",
      "tags": ["tag1", "tag2"],
      "start_marker": "optional — only for multi-topic splits"
    }
  ]
}

SOURCE LANGUAGE: ${sourceLanguage}
CRITICAL LANGUAGE RULES:
- title and category MUST be written in ${sourceLanguage} — NEVER translate to English
- tags: mostly in ${sourceLanguage}, you may add a few cross-language search synonyms
- Do NOT return a "content" field — source text is preserved separately by the system
- Do NOT summarize, shorten, or rewrite the document body

Title rules:
- Short, descriptive, professional
- In ${sourceLanguage}

Category rules:
- Pick from: ${SUGGESTED_CATEGORIES.join(', ')}
- Or create a concise new category in ${sourceLanguage}

Tags rules (8-15 per entry):
- Keywords, synonyms, alternate spellings in ${sourceLanguage}
- A few English/other-language search terms allowed as extras only

Splitting rules:
- Multiple DISTINCT topics (fees + housing + scholarships) → separate entries with start_marker
- Single coherent topic → exactly ONE entry, NO start_marker
- start_marker MUST be copied EXACTLY from the source text (first 40-120 chars of that section)
- start_markers must appear in document order

Do not invent facts.`;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Hafif yerel temizlik — anlamı değiştirmez, çeviri yapmaz */
export function cleanSourceContent(text: string): string {
  return normalizeWhitespace(text)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n');
}

export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().replace(/^#+/, '').toLowerCase();
    if (!tag || tag.length > 80) continue;
    const key = tag.toLocaleLowerCase('tr');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= 20) break;
  }

  return result;
}

export function buildIndexableText(
  content: string,
  tags: string[] | null | undefined,
  title?: string
): string {
  const parts: string[] = [];
  if (title?.trim()) parts.push(`Başlık: ${title.trim()}`);
  const normalizedTags = normalizeTags(tags || []);
  if (normalizedTags.length) parts.push(`Etiketler: ${normalizedTags.join(', ')}`);
  parts.push(content.trim());
  return parts.join('\n\n').slice(0, 8000);
}

function fallbackTitle(content: string, filenameHint?: string): string {
  if (filenameHint?.trim()) {
    const base = filenameHint.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    if (base) return base.slice(0, 120);
  }

  const firstLine = content.split('\n').map((l) => l.trim()).find(Boolean);
  if (firstLine && firstLine.length <= 120) return firstLine;
  if (firstLine) return `${firstLine.slice(0, 117)}...`;
  return 'Bilgi Bankası Kaydı';
}

function buildFallbackEntry(content: string, filenameHint?: string): AnalyzedKnowledgeEntry {
  const normalized = cleanSourceContent(content);
  return {
    title: fallbackTitle(normalized, filenameHint),
    category: 'Genel Bilgiler',
    tags: [],
    content: normalized,
  };
}

function sanitizeMetadata(raw: unknown): MetadataEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;

  const title = typeof item.title === 'string' ? item.title.trim().slice(0, 200) : '';
  const category = typeof item.category === 'string' ? item.category.trim().slice(0, 100) : '';
  const tags = normalizeTags(item.tags);
  const start_marker =
    typeof item.start_marker === 'string' ? item.start_marker.trim() : undefined;

  if (!title) return null;

  return {
    title,
    category: category || 'Genel Bilgiler',
    tags,
    ...(start_marker ? { start_marker } : {}),
  };
}

/** LLM metadata'sını orijinal kaynak metniyle birleştirir — içerik asla kısaltılmaz */
export function mergeMetadataWithSource(
  sourceContent: string,
  metadataEntries: MetadataEntry[]
): AnalyzedKnowledgeEntry[] {
  const source = cleanSourceContent(sourceContent);
  if (!source) return [];
  if (!metadataEntries.length) return [buildFallbackEntry(source)];

  if (metadataEntries.length === 1) {
    const meta = metadataEntries[0];
    return [
      {
        title: meta.title,
        category: meta.category,
        tags: meta.tags,
        content: source,
      },
    ];
  }

  const markers = metadataEntries
    .map((entry, index) => {
      const marker = entry.start_marker?.trim();
      if (!marker) return { index, position: -1, marker: '' };

      const position = source.indexOf(marker);
      return { index, position, marker };
    })
    .filter((m) => m.position >= 0)
    .sort((a, b) => a.position - b.position);

  if (markers.length < metadataEntries.length) {
    console.warn(
      '[KnowledgeAnalysis] Bölüm ayırıcıları bulunamadı, tek kayıt olarak birleştiriliyor'
    );
    const meta = metadataEntries[0];
    return [
      {
        title: meta.title,
        category: meta.category,
        tags: meta.tags,
        content: source,
      },
    ];
  }

  const result: AnalyzedKnowledgeEntry[] = [];

  for (let i = 0; i < markers.length; i++) {
    const meta = metadataEntries[markers[i].index];
    const start = markers[i].position;
    const end = i + 1 < markers.length ? markers[i + 1].position : source.length;
    const sectionContent = cleanSourceContent(source.slice(start, end));

    if (!sectionContent) continue;

    result.push({
      title: meta.title,
      category: meta.category,
      tags: meta.tags,
      content: sectionContent,
    });
  }

  return result.length ? result : [buildFallbackEntry(source)];
}

async function analyzeMetadataWithLLM(
  content: string,
  options?: { companyId?: string; existingCategories?: string[] }
): Promise<MetadataEntry[] | null> {
  const detectedLang = detectConversationLanguage(content.slice(0, 2000));
  const languageName = LANG_NAMES[detectedLang] || detectedLang;

  const categoryHint = options?.existingCategories?.length
    ? `\nExisting categories in this company (prefer reusing): ${options.existingCategories.join(', ')}`
    : '';

  const completion = await createChatCompletion(
    [
      { role: 'system', content: `${buildAnalysisSystemPrompt(languageName)}${categoryHint}` },
      { role: 'user', content: content.slice(0, config.knowledgeAnalysis.maxContentChars) },
    ],
    {
      maxTokens: config.knowledgeAnalysis.maxOutputTokens,
      temperature: 0,
      responseFormat: { type: 'json_object' },
      ...(options?.companyId
        ? { usageLog: { companyId: options.companyId, skipReason: 'knowledge_analysis' } }
        : {}),
    }
  );

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) return null;

  const parsed = JSON.parse(raw) as { entries?: unknown[] };
  if (!Array.isArray(parsed.entries) || !parsed.entries.length) return null;

  const entries = parsed.entries
    .map(sanitizeMetadata)
    .filter((e): e is MetadataEntry => e !== null);

  return entries.length ? entries : null;
}

/** Ham içeriği analiz eder; başlık, kategori, etiket üretir; içerik orijinalden korunur */
export async function analyzeKnowledgeContent(
  rawContent: string,
  options?: {
    filenameHint?: string;
    existingCategories?: string[];
    companyId?: string;
    timeoutMs?: number;
    force?: boolean;
  }
): Promise<KnowledgeAnalysisResult> {
  const content = cleanSourceContent(rawContent);
  if (!content) {
    return { entries: [], analyzed: false, split: false };
  }

  if (!config.knowledgeAnalysis.enabled && !options?.force) {
    const entry = buildFallbackEntry(content, options?.filenameHint);
    return { entries: [entry], analyzed: false, split: false };
  }

  const timeoutMs = options?.timeoutMs ?? config.knowledgeAnalysis.timeoutMs;

  try {
    const metadata = await Promise.race([
      analyzeMetadataWithLLM(content, {
        companyId: options?.companyId,
        existingCategories: options?.existingCategories,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (metadata?.length) {
      const entries = mergeMetadataWithSource(content, metadata);
      return {
        entries,
        analyzed: true,
        split: entries.length > 1,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[KnowledgeAnalysis] LLM fallback:', msg);
  }

  const entry = buildFallbackEntry(content, options?.filenameHint);
  return { entries: [entry], analyzed: false, split: false };
}

/** İlk girişi önizleme alanlarına dönüştürür (parse-file uyumluluğu) */
export function primaryEntryToPreview(
  analysis: KnowledgeAnalysisResult,
  fallbackFilename?: string,
  sourceContent?: string
): {
  title: string;
  category: string;
  tags: string[];
  content: string;
} {
  const entry = analysis.entries[0] ?? buildFallbackEntry(sourceContent || '', fallbackFilename);
  const content =
    sourceContent && analysis.entries.length === 1
      ? cleanSourceContent(sourceContent)
      : entry.content;

  return {
    title: entry.title,
    category: entry.category,
    tags: entry.tags,
    content,
  };
}
