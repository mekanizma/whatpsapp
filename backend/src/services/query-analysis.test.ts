import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchEmbeddingText } from './query-analysis.service';
import type { QueryAnalysis } from './query-analysis.service';

describe('query-analysis', () => {
  it('embedding metnine kavram ve genişletilmiş terimleri ekler', () => {
    const analysis: QueryAnalysis = {
      language: 'en',
      intent: 'accommodation inquiry',
      concepts: ['dormitory', 'student housing'],
      expandedSearchText: 'yurt konaklama dormitory accommodation Wohnheim',
    };

    const text = buildSearchEmbeddingText('Where is the dormitory?', analysis);
    assert.match(text, /Where is the dormitory/);
    assert.match(text, /dormitory/);
    assert.match(text, /yurt konaklama/);
  });

  it('boş genişletme ile yalnızca orijinal mesajı kullanır', () => {
    const analysis: QueryAnalysis = {
      language: 'tr',
      intent: 'general',
      concepts: [],
      expandedSearchText: 'Merhaba',
    };

    const text = buildSearchEmbeddingText('Merhaba', analysis);
    assert.equal(text, 'Merhaba');
  });
});
