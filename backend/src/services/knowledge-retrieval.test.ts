import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContextFromChunks,
  buildRetrievalTexts,
  finalizeRetrievalChunks,
  hasStrongRetrievalMatch,
  mergeRetrievalChunksByMax,
} from './knowledge-retrieval.service';
import type { RetrievedKnowledgeChunk } from '../types';

const UCRETLER_CHUNK: RetrievedKnowledgeChunk = {
  id: 'chunk-ucretler',
  document_id: 'doc-1',
  knowledge_base_id: 'kb-ucretler',
  chunk_index: 0,
  heading: 'Ücretler',
  content: 'Diş temizliği: 1500 TL\nDolgu: 2000 TL\nKanal tedavisi: 3500 TL',
  similarity: 0.42,
  text_rank: 0.05,
  combined_score: 0.31,
};

const OTHER_CHUNK: RetrievedKnowledgeChunk = {
  id: 'chunk-other',
  document_id: 'doc-2',
  knowledge_base_id: 'kb-other',
  chunk_index: 0,
  heading: 'Çalışma Saatleri',
  content: 'Pazartesi - Cuma: 09:00 - 18:00',
  similarity: 0.18,
  text_rank: 0,
  combined_score: 0.126,
};

describe('knowledge-retrieval', () => {
  it('finalizeRetrievalChunks returns top-k above threshold', () => {
    const chunks = finalizeRetrievalChunks(
      [OTHER_CHUNK, UCRETLER_CHUNK],
      6,
      0.25
    );
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].heading, 'Ücretler');
  });

  it('finalizeRetrievalChunks falls back to top-k when none pass threshold', () => {
    const lowUcret = { ...UCRETLER_CHUNK, combined_score: 0.12 };
    const lowOther = { ...OTHER_CHUNK, combined_score: 0.08 };
    const chunks = finalizeRetrievalChunks([lowOther, lowUcret], 6, 0.25);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].heading, 'Ücretler');
  });

  it('"fiyat ne kadar" sorgusu Ücretler chunk\'ını embedding skoruyla seçer', () => {
    const fiyatQueryScore: RetrievedKnowledgeChunk = {
      ...UCRETLER_CHUNK,
      similarity: 0.38,
      combined_score: 0.266,
    };
    const ranked = finalizeRetrievalChunks([OTHER_CHUNK, fiyatQueryScore], 6, 0.25);
    const context = buildContextFromChunks(ranked);

    assert.equal(ranked[0].heading, 'Ücretler');
    assert.match(context, /Dolgu: 2000 TL/);
  });

  it('buildContextFromChunks includes all retrieved chunks for LLM', () => {
    const midChunk: RetrievedKnowledgeChunk = {
      ...UCRETLER_CHUNK,
      id: 'chunk-mid',
      heading: 'İşlemler',
      content: 'Dolgu işlemi açıklaması',
      combined_score: 0.28,
    };
    const chunks = finalizeRetrievalChunks(
      [OTHER_CHUNK, midChunk, UCRETLER_CHUNK],
      6,
      0.25
    );
    const context = buildContextFromChunks(chunks);

    assert.match(context, /### İşlemler/);
    assert.match(context, /### Ücretler/);
    assert.equal(chunks.length, 2);
  });

  it('buildRetrievalTexts dedupes and caps at 4 texts', () => {
    const texts = buildRetrievalTexts('üniversite nerede', [
      'üniversite nerede',
      'üniversite adresi',
      'kampüs konumu',
      'okul yeri',
      'fazla varyant',
    ]);
    assert.equal(texts.length, 4);
    assert.equal(texts[0], 'üniversite nerede');
    assert.ok(texts.includes('üniversite adresi'));
  });

  it('mergeRetrievalChunksByMax keeps max similarity, text_rank, and combined_score per chunk', () => {
    const base: RetrievedKnowledgeChunk = {
      id: 'chunk-1',
      document_id: 'doc-1',
      knowledge_base_id: 'kb-1',
      chunk_index: 0,
      heading: 'Adres',
      content: 'Kampüs: İstanbul',
      similarity: 0.2,
      text_rank: 0.1,
      combined_score: 0.17,
    };
    const fromRaw = [{ ...base, similarity: 0.12, text_rank: 0, combined_score: 0.084 }];
    const fromVariant = [
      {
        ...base,
        similarity: 0.44,
        text_rank: 0.35,
        combined_score: 0.413,
      },
    ];

    const merged = mergeRetrievalChunksByMax([fromRaw, fromVariant]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].similarity, 0.44);
    assert.equal(merged[0].text_rank, 0.35);
    assert.equal(merged[0].combined_score, 0.413);
  });

  it('"üniversite nerede" style query: Turkish variant lifts address chunk when raw scores low', () => {
    const addressChunk: RetrievedKnowledgeChunk = {
      id: 'chunk-address',
      document_id: 'doc-addr',
      knowledge_base_id: 'kb-addr',
      chunk_index: 0,
      heading: 'Adres',
      content: 'Üniversitemiz İstanbul Kadıköy\'de yer almaktadır.',
      similarity: 0.15,
      text_rank: 0,
      combined_score: 0.105,
    };
    const otherChunk: RetrievedKnowledgeChunk = {
      id: 'chunk-other',
      document_id: 'doc-other',
      knowledge_base_id: 'kb-other',
      chunk_index: 0,
      heading: 'Burslar',
      content: 'Burs başvuruları mart ayında açılır.',
      similarity: 0.18,
      text_rank: 0,
      combined_score: 0.126,
    };

    const rawResults = [{ ...otherChunk }, { ...addressChunk }];
    const variantResults = [
      {
        ...addressChunk,
        similarity: 0.41,
        text_rank: 0.28,
        combined_score: 0.371,
      },
    ];

    const merged = mergeRetrievalChunksByMax([rawResults, variantResults]);
    const chunks = finalizeRetrievalChunks(merged, 6, 0.25);

    assert.equal(chunks[0].heading, 'Adres');
    assert.match(buildContextFromChunks(chunks), /Kadıköy/);
    assert.equal(hasStrongRetrievalMatch(chunks), true);
  });

  it('hasStrongRetrievalMatch accepts high text_rank even when combined_score is below threshold', () => {
    const lexicalHit: RetrievedKnowledgeChunk = {
      ...UCRETLER_CHUNK,
      similarity: 0.1,
      text_rank: 0.4,
      combined_score: 0.19,
    };
    assert.equal(hasStrongRetrievalMatch([lexicalHit]), true);
  });

  it('hasStrongRetrievalMatch rejects weak vector-only hits below threshold with no text_rank', () => {
    const weak: RetrievedKnowledgeChunk = {
      ...OTHER_CHUNK,
      similarity: 0.18,
      text_rank: 0,
      combined_score: 0.126,
    };
    assert.equal(hasStrongRetrievalMatch([weak]), false);
  });
});
