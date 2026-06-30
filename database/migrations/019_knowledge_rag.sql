-- Migration 019: Knowledge Base RAG (pgvector + hybrid search)
-- Multi-tenant chunk storage with async indexing support

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- ENUM: indexing status
-- ============================================================
DO $$ BEGIN
  CREATE TYPE knowledge_index_status AS ENUM ('pending', 'indexing', 'ready', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- KNOWLEDGE BASE — RAG metadata columns
-- ============================================================
ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS index_status knowledge_index_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS chunk_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS index_error TEXT,
  ADD COLUMN IF NOT EXISTS source_filename TEXT,
  ADD COLUMN IF NOT EXISTS char_count INT;

-- ============================================================
-- KNOWLEDGE DOCUMENTS (1:1 with knowledge_base entry)
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  knowledge_base_id UUID NOT NULL UNIQUE REFERENCES knowledge_base(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_filename TEXT,
  file_type TEXT,
  char_count INT,
  index_status knowledge_index_status NOT NULL DEFAULT 'pending',
  chunk_count INT NOT NULL DEFAULT 0,
  index_error TEXT,
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_company
  ON knowledge_documents(company_id, index_status);

-- ============================================================
-- KNOWLEDGE CHUNKS (embeddings + full-text)
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  knowledge_base_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  heading TEXT,
  content TEXT NOT NULL,
  embedding vector(1536),
  content_tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(heading, '') || ' ' || coalesce(content, ''))
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_company
  ON knowledge_chunks(company_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_kb
  ON knowledge_chunks(knowledge_base_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tsv
  ON knowledge_chunks
  USING gin (content_tsv);

-- ============================================================
-- TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS trg_knowledge_documents_updated_at ON knowledge_documents;
CREATE TRIGGER trg_knowledge_documents_updated_at
  BEFORE UPDATE ON knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- HYBRID SEARCH RPC (vector + full-text)
-- ============================================================
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  p_company_id UUID,
  query_embedding vector(1536),
  query_text TEXT,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.5,
  vector_weight FLOAT DEFAULT 0.7,
  text_weight FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  knowledge_base_id UUID,
  chunk_index INT,
  heading TEXT,
  content TEXT,
  similarity FLOAT,
  text_rank FLOAT,
  combined_score FLOAT
)
LANGUAGE sql
STABLE
AS $$
  WITH scored AS (
    SELECT
      c.id,
      c.document_id,
      c.knowledge_base_id,
      c.chunk_index,
      c.heading,
      c.content,
      CASE
        WHEN c.embedding IS NOT NULL THEN 1 - (c.embedding <=> query_embedding)
        ELSE 0
      END AS similarity,
      COALESCE(
        ts_rank_cd(c.content_tsv, websearch_to_tsquery('simple', query_text)),
        0
      ) AS text_rank
    FROM knowledge_chunks c
    INNER JOIN knowledge_documents d ON d.id = c.document_id
    WHERE c.company_id = p_company_id
      AND d.index_status = 'ready'
      AND c.embedding IS NOT NULL
      AND (
        (1 - (c.embedding <=> query_embedding)) >= match_threshold
        OR c.content_tsv @@ websearch_to_tsquery('simple', query_text)
      )
  )
  SELECT
    s.id,
    s.document_id,
    s.knowledge_base_id,
    s.chunk_index,
    s.heading,
    s.content,
    s.similarity::FLOAT,
    s.text_rank::FLOAT,
    (
      vector_weight * s.similarity
      + text_weight * LEAST(s.text_rank, 1.0)
    )::FLOAT AS combined_score
  FROM scored s
  ORDER BY combined_score DESC, s.similarity DESC
  LIMIT GREATEST(match_count, 1);
$$;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to knowledge documents"
  ON knowledge_documents FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin can manage knowledge documents"
  ON knowledge_documents FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

CREATE POLICY "Company members can view knowledge documents"
  ON knowledge_documents FOR SELECT
  USING (company_id = get_user_company_id());

CREATE POLICY "Super admin full access to knowledge chunks"
  ON knowledge_chunks FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin can manage knowledge chunks"
  ON knowledge_chunks FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

CREATE POLICY "Company members can view knowledge chunks"
  ON knowledge_chunks FOR SELECT
  USING (company_id = get_user_company_id());
