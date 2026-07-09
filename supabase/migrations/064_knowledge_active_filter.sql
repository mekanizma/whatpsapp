-- Migration 064: Exclude inactive knowledge base entries from RAG search

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  p_company_id UUID,
  query_embedding vector(1536),
  query_text TEXT,
  match_count INT DEFAULT 6,
  match_threshold FLOAT DEFAULT 0.25,
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
  WITH tsq AS (
    SELECT kb_or_tsquery(query_text) AS q
  ),
  scored AS (
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
        ts_rank_cd(c.content_tsv, tsq.q),
        0
      ) AS text_rank,
      (
        vector_weight * CASE
          WHEN c.embedding IS NOT NULL THEN 1 - (c.embedding <=> query_embedding)
          ELSE 0
        END
        + text_weight * LEAST(
          COALESCE(
            ts_rank_cd(c.content_tsv, tsq.q),
            0
          ),
          1.0
        )
      )::FLOAT AS combined_score
    FROM knowledge_chunks c
    INNER JOIN knowledge_documents d ON d.id = c.document_id
    INNER JOIN knowledge_base kb ON kb.id = c.knowledge_base_id AND kb.is_active = TRUE
    CROSS JOIN tsq
    WHERE c.company_id = p_company_id
      AND d.index_status = 'ready'
      AND c.embedding IS NOT NULL
  ),
  ranked AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (ORDER BY s.combined_score DESC, s.similarity DESC) AS rn
    FROM scored s
  ),
  above_count AS (
    SELECT COUNT(*)::INT AS cnt FROM ranked WHERE combined_score >= match_threshold
  )
  SELECT
    r.id,
    r.document_id,
    r.knowledge_base_id,
    r.chunk_index,
    r.heading,
    r.content,
    r.similarity::FLOAT,
    r.text_rank::FLOAT,
    r.combined_score::FLOAT
  FROM ranked r
  CROSS JOIN above_count ac
  WHERE (ac.cnt > 0 AND r.combined_score >= match_threshold)
     OR (ac.cnt = 0)
  ORDER BY r.combined_score DESC, r.similarity DESC
  LIMIT GREATEST(match_count, 1);
$$;
