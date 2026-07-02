-- Migration 033: Persistent AI response cache (per-tenant, hashed keys)

CREATE TABLE IF NOT EXISTS ai_response_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  normalized_message_hash TEXT NOT NULL,
  response TEXT NOT NULL,
  should_transfer BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, normalized_message_hash)
);

CREATE INDEX IF NOT EXISTS idx_ai_response_cache_lookup
  ON ai_response_cache(company_id, normalized_message_hash);

CREATE INDEX IF NOT EXISTS idx_ai_response_cache_expires
  ON ai_response_cache(expires_at);

ALTER TABLE ai_response_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to ai response cache"
  ON ai_response_cache FOR ALL
  USING (is_super_admin());

CREATE POLICY "Service can manage ai response cache"
  ON ai_response_cache FOR ALL
  WITH CHECK (true);
