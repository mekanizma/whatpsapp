-- Migration 035: Multi-variant FTS (unaccent + OR words) and knowledge-miss cache cleanup

CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() is STABLE; generated columns require IMMUTABLE expressions
CREATE OR REPLACE FUNCTION kb_immutable_unaccent(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
AS $$
  SELECT unaccent('unaccent', p_text);
$$;

-- Rebuild content_tsv with unaccent on the same 'simple' config (regenerates stored vectors)
DROP INDEX IF EXISTS idx_knowledge_chunks_tsv;

ALTER TABLE knowledge_chunks DROP COLUMN IF EXISTS content_tsv;

ALTER TABLE knowledge_chunks ADD COLUMN content_tsv tsvector GENERATED ALWAYS AS (
  to_tsvector('simple', kb_immutable_unaccent(coalesce(heading, '') || ' ' || coalesce(content, '')))
) STORED;

CREATE INDEX idx_knowledge_chunks_tsv
  ON knowledge_chunks
  USING gin (content_tsv);

-- OR tsquery: each word in query_text matches independently (partial keyword overlap)
CREATE OR REPLACE FUNCTION kb_or_tsquery(p_query_text TEXT)
RETURNS tsquery
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  words TEXT[];
  q TEXT;
BEGIN
  words := regexp_split_to_array(lower(kb_immutable_unaccent(coalesce(trim(p_query_text), ''))), '\s+');
  q := (
    SELECT string_agg(w, ' | ')
    FROM unnest(words) AS w
    WHERE length(w) > 0
  );
  IF q IS NULL OR q = '' THEN
    RETURN to_tsquery('simple', '');
  END IF;
  RETURN to_tsquery('simple', q);
END;
$$;

DROP FUNCTION IF EXISTS match_knowledge_chunks(
  UUID,
  vector(1536),
  TEXT,
  INT,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION
);

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

-- Remove previously cached knowledge-miss responses
DELETE FROM ai_response_cache
WHERE lower(unaccent(response)) ~ 'bilgi bankamizda kayit bulunmuyor'
   OR lower(unaccent(response)) ~ 'bilgi bankamizda bu konu'
   OR lower(unaccent(response)) ~ 'bu konuda bilgi bankamizda'
   OR lower(unaccent(response)) ~ 'net bilgiye ulasamadim'
   OR lower(unaccent(response)) ~ 'net bilgi bulamadim'
   OR lower(unaccent(response)) ~ 'eslesen icerik bulunamadi'
   OR lower(unaccent(response)) ~ 'bilgi bankasinda eslesen'
   OR lower(unaccent(response)) ~ 'bilgiye sahip degilim'
   OR lower(unaccent(response)) ~ 'bu konuda bilgim( yok| bulunmuyor| mevcut degil)'
   OR lower(unaccent(response)) ~ 'bu konu hakkinda bilgim( yok| bulunmuyor)'
   OR lower(unaccent(response)) ~ 'bilgim(iz)? (yok|bulunmuyor|mevcut degil)'
   OR lower(unaccent(response)) ~ 'could not find (clear )?information'
   OR lower(unaccent(response)) ~ 'not in (our |the )?knowledge base'
   OR lower(unaccent(response)) ~ 'don''t have (that |this |any )?information'
   OR lower(unaccent(response)) ~ 'do not have (that |this |any )?information'
   OR lower(unaccent(response)) ~ 'i don''t have (that |this |any )?information'
   OR lower(unaccent(response)) ~ 'i do not have (that |this |any )?information'
   OR lower(unaccent(response)) ~ 'no information (in|on|about|regarding)'
   OR lower(unaccent(response)) ~ 'avoid misguiding you';
