import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveKnowledgeContextForAI } from './knowledge-context.service';
import { filterRelevantKnowledge } from '../ai/knowledge-filter.service';
import type { KnowledgeItem } from '../types';

const SAMPLE_KB: KnowledgeItem[] = [
  {
    title: 'Fiyat Bilgileri',
    content: 'Diş temizliği: 1500 TL\nDolgu: 2000 TL',
    category: 'fiyat',
  },
  {
    title: 'Dolgu İşlemleri',
    content: 'Kompozit dolgu uygulanır. Beyaz estetik dolgu mevcuttur.',
    category: 'genel',
  },
];

describe('knowledge-context', () => {
  it('fiyat sorusunda RAG yanlış chunk getirse fiyat bölümünü ekler', () => {
    const kbFilter = filterRelevantKnowledge(SAMPLE_KB, 'Dolgu ne kadar');
    const knowledge = resolveKnowledgeContextForAI(
      {
        context: '### Dolgu İşlemleri\nKompozit dolgu uygulanır.',
        chunks: [],
        usedRag: true,
        fallbackItems: SAMPLE_KB,
        kbHasNoMatch: false,
      },
      kbFilter,
      SAMPLE_KB,
      'Dolgu ne kadar'
    );

    assert.match(knowledge, /Dolgu: 2000/);
    assert.match(knowledge, /Kompozit dolgu/);
  });

  it('RAG yoksa keyword filtresine düşer', () => {
    const kbFilter = filterRelevantKnowledge(SAMPLE_KB, 'Dolgu ne kadar');
    const knowledge = resolveKnowledgeContextForAI(
      {
        context: '',
        chunks: [],
        usedRag: false,
        fallbackItems: SAMPLE_KB,
        kbHasNoMatch: true,
      },
      kbFilter,
      SAMPLE_KB,
      'Dolgu ne kadar'
    );

    assert.match(knowledge, /Dolgu: 2000/);
  });
});
