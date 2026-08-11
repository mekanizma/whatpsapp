-- Store RAG knowledge sources on AI messages (manager-only visibility in API/UI)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS rag_sources JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN messages.rag_sources IS
  'AI yanıtında kullanılan bilgi bankası kaynakları: [{knowledge_base_id, title, chunk_index, heading?}]';
