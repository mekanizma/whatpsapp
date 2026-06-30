/**
 * Async knowledge indexing — chunk, embed, store in Supabase
 */

import { config } from '../config';
import { adminClient } from '../database/supabase';
import { chunkText } from './chunking.service';
import { createEmbeddings } from './embedding.service';
import type { KnowledgeIndexStatus } from '../types';

const DEBOUNCE_MS = 1500;
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const inFlight = new Set<string>();

async function setIndexStatus(
  knowledgeBaseId: string,
  companyId: string,
  status: KnowledgeIndexStatus,
  extra?: { chunk_count?: number; index_error?: string | null }
): Promise<void> {
  const payload: Record<string, unknown> = {
    index_status: status,
    ...(extra?.chunk_count !== undefined ? { chunk_count: extra.chunk_count } : {}),
    ...(extra?.index_error !== undefined ? { index_error: extra.index_error } : {}),
  };

  await Promise.all([
    adminClient
      .from('knowledge_base')
      .update(payload)
      .eq('id', knowledgeBaseId)
      .eq('company_id', companyId),
    adminClient
      .from('knowledge_documents')
      .update({
        index_status: status,
        ...(extra?.chunk_count !== undefined ? { chunk_count: extra.chunk_count } : {}),
        ...(extra?.index_error !== undefined ? { index_error: extra.index_error } : {}),
        ...(status === 'ready' ? { indexed_at: new Date().toISOString() } : {}),
      })
      .eq('knowledge_base_id', knowledgeBaseId)
      .eq('company_id', companyId),
  ]);
}

async function ensureDocument(
  knowledgeBaseId: string,
  companyId: string
): Promise<string> {
  const { data: existing } = await adminClient
    .from('knowledge_documents')
    .select('id')
    .eq('knowledge_base_id', knowledgeBaseId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: kb } = await adminClient
    .from('knowledge_base')
    .select('title, source_filename, category, char_count')
    .eq('id', knowledgeBaseId)
    .eq('company_id', companyId)
    .single();

  if (!kb) throw new Error('Bilgi bankası kaydı bulunamadı');

  const { data: created, error } = await adminClient
    .from('knowledge_documents')
    .insert({
      company_id: companyId,
      knowledge_base_id: knowledgeBaseId,
      title: kb.title,
      source_filename: kb.source_filename,
      file_type: kb.category,
      char_count: kb.char_count,
      index_status: 'pending',
    })
    .select('id')
    .single();

  if (error || !created) {
    throw new Error(error?.message || 'Doküman kaydı oluşturulamadı');
  }

  return created.id;
}

export async function indexKnowledgeItem(
  knowledgeBaseId: string,
  companyId: string
): Promise<void> {
  const key = `${companyId}:${knowledgeBaseId}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);

  try {
    const { data: kb, error: kbError } = await adminClient
      .from('knowledge_base')
      .select('id, title, content, category, source_filename, is_active')
      .eq('id', knowledgeBaseId)
      .eq('company_id', companyId)
      .single();

    if (kbError || !kb) {
      throw new Error(kbError?.message || 'Bilgi bankası kaydı bulunamadı');
    }

    if (!kb.is_active) {
      await setIndexStatus(knowledgeBaseId, companyId, 'ready', {
        chunk_count: 0,
        index_error: null,
      });
      return;
    }

    const content = (kb.content || '').trim();
    if (!content) {
      await setIndexStatus(knowledgeBaseId, companyId, 'failed', {
        index_error: 'İndekslenecek içerik yok',
      });
      return;
    }

    await setIndexStatus(knowledgeBaseId, companyId, 'indexing', { index_error: null });

    const documentId = await ensureDocument(knowledgeBaseId, companyId);

    await adminClient
      .from('knowledge_chunks')
      .delete()
      .eq('document_id', documentId)
      .eq('company_id', companyId);

    const chunks = chunkText(content, kb.title);
    if (!chunks.length) {
      await setIndexStatus(knowledgeBaseId, companyId, 'failed', {
        index_error: 'Chunk oluşturulamadı',
      });
      return;
    }

    const batchSize = config.rag.indexBatchSize;
    for (let offset = 0; offset < chunks.length; offset += batchSize) {
      const batch = chunks.slice(offset, offset + batchSize);
      const embeddings = await createEmbeddings(batch.map((c) => c.content));

      const rows = batch.map((chunk, i) => ({
        company_id: companyId,
        document_id: documentId,
        knowledge_base_id: knowledgeBaseId,
        chunk_index: chunk.index,
        heading: chunk.heading,
        content: chunk.content,
        embedding: embeddings[i],
      }));

      const { error: insertError } = await adminClient
        .from('knowledge_chunks')
        .insert(rows);

      if (insertError) {
        throw new Error(insertError.message);
      }
    }

    await setIndexStatus(knowledgeBaseId, companyId, 'ready', {
      chunk_count: chunks.length,
      index_error: null,
    });

    console.log(
      `[RAG] Indexed ${chunks.length} chunks → KB ${knowledgeBaseId} (${kb.title})`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[RAG] Index failed for ${knowledgeBaseId}:`, message);
    await setIndexStatus(knowledgeBaseId, companyId, 'failed', {
      index_error: message.slice(0, 500),
    });
  } finally {
    inFlight.delete(key);
  }
}

/** Debounced async indexing — non-blocking for API responses */
export function scheduleKnowledgeIndexing(
  knowledgeBaseId: string,
  companyId: string
): void {
  const key = `${companyId}:${knowledgeBaseId}`;
  const existing = pendingTimers.get(key);
  if (existing) clearTimeout(existing);

  void setIndexStatus(knowledgeBaseId, companyId, 'pending', { index_error: null });

  const timer = setTimeout(() => {
    pendingTimers.delete(key);
    void indexKnowledgeItem(knowledgeBaseId, companyId);
  }, DEBOUNCE_MS);

  pendingTimers.set(key, timer);
}

/** Resume pending/failed indexing after server restart */
export async function recoverPendingKnowledgeIndexing(): Promise<void> {
  const { data, error } = await adminClient
    .from('knowledge_base')
    .select('id, company_id')
    .eq('is_active', true)
    .in('index_status', ['pending', 'indexing', 'failed']);

  if (error) {
    console.error('[RAG] Recovery query failed:', error.message);
    return;
  }

  for (const row of data || []) {
    scheduleKnowledgeIndexing(row.id, row.company_id);
  }

  if (data?.length) {
    console.log(`[RAG] ${data.length} kayıt için indeksleme kuyruğa alındı`);
  }
}
