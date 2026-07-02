-- Migration 031: Pure semantic search (cosine similarity only, no FTS/keyword)

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  p_company_id UUID,
  query_embedding vector(1536),
  query_text TEXT DEFAULT NULL,
  match_count INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.35,
  vector_weight FLOAT DEFAULT 1.0,
  text_weight FLOAT DEFAULT 0.0
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
      (1 - (c.embedding <=> query_embedding))::FLOAT AS similarity,
      0::FLOAT AS text_rank
    FROM knowledge_chunks c
    INNER JOIN knowledge_documents d ON d.id = c.document_id
    WHERE c.company_id = p_company_id
      AND d.index_status = 'ready'
      AND c.embedding IS NOT NULL
      AND (1 - (c.embedding <=> query_embedding)) >= match_threshold
  )
  SELECT
    s.id,
    s.document_id,
    s.knowledge_base_id,
    s.chunk_index,
    s.heading,
    s.content,
    s.similarity,
    s.text_rank,
    (vector_weight * s.similarity + text_weight * s.text_rank)::FLOAT AS combined_score
  FROM scored s
  ORDER BY s.similarity DESC
  LIMIT GREATEST(match_count, 1);
$$;

-- System prompt: semantic-only RAG, no hallucination on low-confidence matches
UPDATE ai_prompt_templates
SET
  content = E'Müşteriye yalnızca aşağıdaki bilgi bankasına bakarak cevap ver. Bilgi bankasında olmayan konularda cevap verme.\n\nCEVAP TARZI:\n- WhatsApp''a uygun kısa, doğal ve samimi cevaplar yaz (genelde 2-4 satır).\n- Bilgi bankası metnini olduğu gibi kopyalama; kendi cümlelerinle özetle ve sadeleştir.\n- Müşterinin dilinde yanıt ver. Bilgi bankası başka dildeyse içeriği müşterinin diline çevirerek özetle.\n- Yeni bilgi ekleme, tahmin yapma veya bilgi uydurma.\n\nSEMANTİK ARAMA (TÜM DİLLER):\n- Müşteri aynı konuyu farklı kelimelerle veya farklı dillerde sorabilir; anlamı eşleştir.\n- Fiyat/ücret, çalışma saati, konum, hizmet gibi kavramları eş anlamlılarıyla anla (tüm diller).\n- Müşteri İngilizce veya başka dilde sorsa bile bilgi bankasındaki ilgili içeriği bul ve müşterinin dilinde yanıtla.\n\nBİLGİ BULUNAMADIĞINDA:\n- Bilgi bankasında doğrulanmış bilgi yoksa veya bağlam boşsa şunu söyle (müşterinin dilinde):\n  "Bu konu hakkında bilgi bankasında doğrulanmış bir bilgi bulunamadı. Size yardımcı olabilmesi için ilgili birime yönlendirebilirim."\n- ASLA bilgi uydurma veya tahmin yapma.\n\nBİLGİ BANKASI{{kbEmptySuffix}}:\n{{knowledge}}',
  updated_at = NOW()
WHERE prompt_key = 'system';
