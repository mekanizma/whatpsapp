-- Migration 031: Lower RAG match threshold; rank by combined_score instead of hard cutoff

-- PostgreSQL cannot change parameter defaults via CREATE OR REPLACE alone
DROP FUNCTION IF EXISTS match_knowledge_chunks(
  UUID,
  vector(1536),
  TEXT,
  INT,
  DOUBLE PRECISION,
  DOUBLE PRECISION,
  DOUBLE PRECISION
);

CREATE OR REPLACE FUNCTION match_knowledge_chunks(  p_company_id UUID,
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
      ) AS text_rank,
      (
        vector_weight * CASE
          WHEN c.embedding IS NOT NULL THEN 1 - (c.embedding <=> query_embedding)
          ELSE 0
        END
        + text_weight * LEAST(
          COALESCE(
            ts_rank_cd(c.content_tsv, websearch_to_tsquery('simple', query_text)),
            0
          ),
          1.0
        )
      )::FLOAT AS combined_score
    FROM knowledge_chunks c
    INNER JOIN knowledge_documents d ON d.id = c.document_id
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

-- Instruct LLM to quote only the relevant fact from retrieved chunks
UPDATE ai_prompt_templates
SET
  content = E'Müşteriye yalnızca aşağıdaki bilgi bankasına bakarak cevap ver. Bilgi bankasında olmayan konularda cevap verme.\n\nCEVAP TARZI:\n- WhatsApp''a uygun kısa, doğal ve samimi cevaplar yaz (genelde 2-4 satır).\n- Bilgi bankası metnini olduğu gibi kopyalama; kendi cümlelerinle özetle.\n- Müşterinin dilinde yanıt ver. Bilgi bankası başka dildeyse içeriği müşterinin diline çevirerek özetle.\n\nBAĞLAM KULLANIMI:\n- Aşağıda birden fazla bilgi parçası (chunk) olabilir; hepsini oku ama yanıtta yalnızca müşterinin sorduğu konuya ait bilgiyi kullan.\n- Örneğin fiyat listesinde yalnızca sorulan işlemin fiyatını yaz; tüm listeyi dökme.\n- Örneğin "dolgu ne kadar" denildiğinde yalnızca dolgu satırını belirt.\n- Chunk başlıkları (###) konu ipucudur; semantik olarak en alakalı parçayı seç.\n\nSEMANTİK EŞLEŞTİRME (TÜM DİLLER):\nMüşteri aynı konuyu farklı kelimelerle veya farklı dillerde sorabilir (ör. "fiyat" = "ücret", "price" = "fee"). Bilgi bankasındaki anlamsal olarak ilgili bölümü kullan.\n\nÖNEMLİ:\n- Müşteri İngilizce veya başka dilde sorsa bile bilgi bankasındaki Türkçe (veya farklı dildeki) içeriği bul ve müşterinin dilinde yanıtla.\n- Bilgi bankasında ücret veya fiyat yazıyorsa ASLA "bu konuda bilgim yok" / "I don''t have information" deme.\n- "Ne kadar sürer" / "how long does it take" süre sorusudur; fiyat sorusu değildir.\n\nBİLGİ BANKASI{{kbEmptySuffix}}:\n{{knowledge}}',
  updated_at = NOW()
WHERE prompt_key = 'system';
