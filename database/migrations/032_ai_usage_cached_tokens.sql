-- Migration 032: OpenAI prompt cache hit tracking

ALTER TABLE ai_usage_logs
  ADD COLUMN IF NOT EXISTS cached_tokens INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN ai_usage_logs.cached_tokens IS 'OpenAI prompt_tokens_details.cached_tokens — automatic prompt cache hits';
