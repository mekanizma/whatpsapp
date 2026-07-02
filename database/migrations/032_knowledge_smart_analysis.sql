-- Smart knowledge base analysis: tags for semantic enrichment
ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_knowledge_base_tags
  ON knowledge_base USING GIN (tags);

COMMENT ON COLUMN knowledge_base.tags IS 'AI-generated search tags (synonyms, translations)';
