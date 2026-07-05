/**
 * OpenAI embedding generation for knowledge chunks
 */

import { config } from '../config';
import { openai } from '../ai/openai-client';
import type OpenAI from 'openai';

export const EMBEDDING_DIMENSIONS = 1536;

export function assertEmbeddingDimensions(vector: number[], label = 'embedding'): void {
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding boyutu ${EMBEDDING_DIMENSIONS} olmalı, ${vector.length} döndü (${label})`
    );
  }
}

type EmbeddingsCreateParams = OpenAI.EmbeddingCreateParams;

export const embeddingDeps = {
  embeddingsCreate: (params: EmbeddingsCreateParams) => openai.embeddings.create(params),
};

export async function createEmbedding(text: string): Promise<number[]> {
  const response = await embeddingDeps.embeddingsCreate({
    model: config.rag.embeddingModel,
    input: text.slice(0, 8000),
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const vector = response.data[0]?.embedding;
  if (!vector?.length) {
    throw new Error('Embedding oluşturulamadı');
  }
  assertEmbeddingDimensions(vector);
  return vector;
}

export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];

  const response = await embeddingDeps.embeddingsCreate({
    model: config.rag.embeddingModel,
    input: texts.map((t) => t.slice(0, 8000)),
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const vectors = response.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);

  if (vectors.some((v) => !v?.length)) {
    throw new Error('Embedding oluşturulamadı');
  }

  vectors.forEach((vector, index) => {
    assertEmbeddingDimensions(vector, `batch[${index}]`);
  });

  return vectors;
}
