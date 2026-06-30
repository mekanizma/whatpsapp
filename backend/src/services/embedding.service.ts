/**
 * OpenAI embedding generation for knowledge chunks
 */

import { config } from '../config';
import { openai } from '../ai/openai-client';

export async function createEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: config.rag.embeddingModel,
    input: text.slice(0, 8000),
    dimensions: config.rag.embeddingDimensions,
  });

  const vector = response.data[0]?.embedding;
  if (!vector?.length) {
    throw new Error('Embedding oluşturulamadı');
  }
  return vector;
}

export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];

  const response = await openai.embeddings.create({
    model: config.rag.embeddingModel,
    input: texts.map((t) => t.slice(0, 8000)),
    dimensions: config.rag.embeddingDimensions,
  });

  return response.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}
