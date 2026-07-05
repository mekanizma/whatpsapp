-- Migration 045: Stamp embedding model on indexed documents (mixed-model safety)

ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS embedding_model TEXT;

COMMENT ON COLUMN knowledge_documents.embedding_model IS
  'OpenAI embedding model used when index_status=ready; must match EMBEDDING_MODEL config for vector retrieval';
