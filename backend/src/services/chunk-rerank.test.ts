import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRerankScores,
  parseRerankScores,
  rerankChunks,
  chunkRerankDeps,
} from './chunk-rerank.service';
import type { RetrievedKnowledgeChunk } from '../types';

function chunk(
  id: string,
  heading: string,
  content: string,
  score = 0.5
): RetrievedKnowledgeChunk {
  return {
    id,
    document_id: `doc-${id}`,
    knowledge_base_id: `kb-${id}`,
    chunk_index: 0,
    heading,
    content,
    similarity: score,
    text_rank: 0.1,
    combined_score: score,
  };
}

describe('chunk-rerank.service', () => {
  const orig = chunkRerankDeps.createChatCompletion;

  afterEach(() => {
    chunkRerankDeps.createChatCompletion = orig;
  });

  it('parseRerankScores reads index/score/reason', () => {
    const scores = parseRerankScores(
      '{"scores":[{"index":0,"score":0.9,"reason":"uygun"},{"index":1,"score":0.1,"reason":"alakasız"}]}',
      2
    );
    assert.equal(scores.length, 2);
    assert.equal(scores[0].score, 0.9);
  });

  it('applyRerankScores drops below threshold, sorts, and respects keep', () => {
    const chunks = [
      chunk('a', 'Yurt', 'Yurt ücretleri yıllık...', 0.4),
      chunk('b', 'Pasaport', 'Pasaport 2 yıllık...', 0.5),
      chunk('c', 'Burs', 'Burs oranı...', 0.3),
      chunk('d', 'Pasaport süre', 'Geçerlilik süresi...', 0.45),
    ];
    const kept = applyRerankScores(
      chunks,
      [
        { index: 0, score: 0.1, reason: 'yurt' },
        { index: 1, score: 0.9, reason: 'pasaport' },
        { index: 2, score: 0.2, reason: 'burs' },
        { index: 3, score: 0.7, reason: 'süre' },
      ],
      0.45,
      3
    );
    assert.equal(kept.length, 2);
    assert.equal(kept[0].heading, 'Pasaport');
    assert.equal(kept[1].heading, 'Pasaport süre');
  });

  it('applyRerankScores returns empty when all below threshold', () => {
    const chunks = [chunk('a', 'Muhaceret', '...', 0.5), chunk('b', 'Yurt', '...', 0.4)];
    const kept = applyRerankScores(
      chunks,
      [
        { index: 0, score: 0.1, reason: 'no' },
        { index: 1, score: 0.2, reason: 'no' },
      ],
      0.45,
      3
    );
    assert.deepEqual(kept, []);
  });

  it('rerankChunks keeps input on LLM error', async () => {
    chunkRerankDeps.createChatCompletion = async () => {
      throw new Error('timeout');
    };
    const input = [
      chunk('a', 'A', 'content a'),
      chunk('b', 'B', 'content b'),
    ];
    const result = await rerankChunks('co', 'soru', 'konu', input);
    assert.equal(result.kept.length, 2);
    assert.equal(result.dropped, 0);
  });

  it('rerankChunks skips LLM when only one chunk', async () => {
    let called = false;
    chunkRerankDeps.createChatCompletion = async () => {
      called = true;
      throw new Error('should not run');
    };
    const input = [chunk('a', 'A', 'content')];
    const result = await rerankChunks('co', 'soru', null, input);
    assert.equal(called, false);
    assert.equal(result.kept.length, 1);
  });

  it('rerankChunks filters via mocked scores', async () => {
    chunkRerankDeps.createChatCompletion = async () =>
      ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                scores: [
                  { index: 0, score: 0.1, reason: 'alakasız' },
                  { index: 1, score: 0.8, reason: 'uygun' },
                  { index: 2, score: 0.5, reason: 'kısmen' },
                ],
              }),
            },
          },
        ],
        usage: { total_tokens: 12 },
      }) as never;

    const input = [
      chunk('m', 'Muhaceret', 'Muhaceret işlemleri...'),
      chunk('p', 'Pasaport', 'Pasaport süresi...'),
      chunk('y', 'Yurt', 'Yurt kaydı...'),
    ];
    const result = await rerankChunks('co', 'pasaport süresi', 'pasaport', input);
    assert.equal(result.kept.length, 2);
    assert.equal(result.kept[0].heading, 'Pasaport');
    assert.equal(result.dropped, 1);
  });
});
