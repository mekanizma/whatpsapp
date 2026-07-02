import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContextFromChunks,
  finalizeRetrievalChunks,
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
});
