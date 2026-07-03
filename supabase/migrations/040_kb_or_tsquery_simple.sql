-- Migration 040: Fix kb_or_tsquery over-stemming (konum→ko matches Konaklama, not Adres)

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
  IF q IS NULL OR q = '' THEN
    RETURN to_tsquery('simple', '');
  END IF;
  -- content_tsv uses turkish; query tokens use simple to avoid konum→ko / ulasim→ulas truncation
  RETURN to_tsquery('simple', q);
END;
$$;
