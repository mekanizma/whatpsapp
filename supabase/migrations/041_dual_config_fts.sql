-- Migration 041: Dual-config FTS — turkish||simple content_tsv + symmetric kb_or_tsquery

DROP INDEX IF EXISTS idx_knowledge_chunks_tsv;

ALTER TABLE knowledge_chunks DROP COLUMN IF EXISTS content_tsv;

ALTER TABLE knowledge_chunks ADD COLUMN content_tsv tsvector GENERATED ALWAYS AS (
  to_tsvector(
    'turkish',
    kb_immutable_unaccent(coalesce(heading, '') || ' ' || coalesce(content, ''))
  )
  || to_tsvector(
    'simple',
    kb_immutable_unaccent(coalesce(heading, '') || ' ' || coalesce(content, ''))
  )
) STORED;

CREATE INDEX idx_knowledge_chunks_tsv
  ON knowledge_chunks
  USING gin (content_tsv);

CREATE OR REPLACE FUNCTION kb_or_tsquery(p_query_text TEXT)
RETURNS tsquery
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  words TEXT[];
  q TEXT;
BEGIN
  words := regexp_split_to_array(
    kb_immutable_unaccent(coalesce(trim(p_query_text), '')),
    '\s+'
  );
  q := (
    SELECT string_agg(t, ' | ')
    FROM (
      SELECT kb_sanitize_fts_token(w) AS t
      FROM unnest(words) AS w
    ) s
    WHERE t IS NOT NULL
  );
  -- to_tsquery('simple', '') raises "syntax error in tsquery"; use plainto for empty input
  IF q IS NULL OR q = '' THEN
    RETURN plainto_tsquery('simple', '');
  END IF;
  -- OR both configs: turkish stems + simple literals (symmetric with dual content_tsv)
  RETURN to_tsquery('turkish', q) || to_tsquery('simple', q);
END;
$$;

UPDATE knowledge_chunks SET content = content WHERE content IS NOT NULL;

-- Verification (raises on failure — run after apply)
-- Note: PG turkish stems üniversite→üniversi but indexes Üniversitesi as simple 'universitesi';
-- bare kb_or_tsquery('universite') does not cross-match — use suffix form or rely on vector leg.
DO $$
DECLARE
  doc tsvector;
  q tsquery;
BEGIN
  doc := to_tsvector('turkish', kb_immutable_unaccent('Uluslararası Final Üniversitesi'))
      || to_tsvector('simple', kb_immutable_unaccent('Uluslararası Final Üniversitesi'));
  q := kb_or_tsquery('universitesi');
  IF NOT (doc @@ q) THEN
    RAISE EXCEPTION '041 verify failed: universitesi should match Üniversitesi via dual tsv + kb_or_tsquery';
  END IF;

  doc := to_tsvector('turkish', kb_immutable_unaccent('Konum bilgisi ve ulaşım'))
      || to_tsvector('simple', kb_immutable_unaccent('Konum bilgisi ve ulaşım'));
  q := kb_or_tsquery('konum');
  IF NOT (doc @@ q) THEN
    RAISE EXCEPTION '041 verify failed: konum should match Konum via dual tsv + kb_or_tsquery';
  END IF;

  -- Manual: kb_or_tsquery('universite') vs Üniversitesi doc is false in PG (stem mismatch); LLM/vector covers it.

  -- All tokens < 3 chars after sanitize — must not raise (040 used to_tsquery('simple',''))
  q := kb_or_tsquery('ne');
  PERFORM q;
END $$;
