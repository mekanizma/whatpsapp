import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMBEDDING_DIMENSIONS,
  assertEmbeddingDimensions,
  createEmbedding,
  createEmbeddings,
  embeddingDeps,
} from './embedding.service';

function fakeVector(length: number): number[] {
  return Array.from({ length }, (_, i) => i / length);
}

describe('embedding.service', () => {
  const origCreate = embeddingDeps.embeddingsCreate;

  beforeEach(() => {
    embeddingDeps.embeddingsCreate = async (params) => {
      const inputs = Array.isArray(params.input) ? params.input : [params.input];
      assert.equal(params.dimensions, EMBEDDING_DIMENSIONS);
      return {
        data: inputs.map((_, index) => ({
          index,
          embedding: fakeVector(EMBEDDING_DIMENSIONS),
          object: 'embedding' as const,
        })),
        model: params.model,
        object: 'list',
        usage: { prompt_tokens: 1, total_tokens: 1 },
      };
    };
  });

  afterEach(() => {
    embeddingDeps.embeddingsCreate = origCreate;
  });

  it('assertEmbeddingDimensions accepts 1536-length vectors', () => {
    assert.doesNotThrow(() => assertEmbeddingDimensions(fakeVector(1536)));
  });

  it('assertEmbeddingDimensions throws on wrong length', () => {
    assert.throws(
      () => assertEmbeddingDimensions(fakeVector(512), 'test'),
      /Embedding boyutu 1536 olmalı, 512 döndü/
    );
  });

  it('createEmbedding passes dimensions=1536 and validates response', async () => {
    let capturedDimensions: number | undefined;
    embeddingDeps.embeddingsCreate = async (params) => {
      capturedDimensions = params.dimensions;
      return {
        data: [{ index: 0, embedding: fakeVector(1536), object: 'embedding' }],
        model: params.model,
        object: 'list',
        usage: { prompt_tokens: 1, total_tokens: 1 },
      };
    };

    const vector = await createEmbedding('test query');
    assert.equal(capturedDimensions, 1536);
    assert.equal(vector.length, 1536);
  });

  it('createEmbeddings rejects batch vectors with wrong dimension', async () => {
    embeddingDeps.embeddingsCreate = async (params) => {
      const inputs = Array.isArray(params.input) ? params.input : [params.input];
      return {
        data: inputs.map((_, index) => ({
          index,
          embedding: fakeVector(index === 0 ? 1536 : 768),
          object: 'embedding' as const,
        })),
        model: params.model,
        object: 'list',
        usage: { prompt_tokens: 1, total_tokens: 1 },
      };
    };

    await assert.rejects(
      () => createEmbeddings(['a', 'b']),
      /Embedding boyutu 1536 olmalı, 768 döndü \(batch\[1\]\)/
    );
  });
});
