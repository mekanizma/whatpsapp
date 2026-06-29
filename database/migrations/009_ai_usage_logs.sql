-- Migration 009: AI kullanım logları ve kota takibi
-- Kredi optimizasyonu için token tüketimi izleme

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_phone TEXT,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  cached BOOLEAN NOT NULL DEFAULT FALSE,
  skipped BOOLEAN NOT NULL DEFAULT FALSE,
  skip_reason TEXT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_company_month ON ai_usage_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_company_phone ON ai_usage_logs(company_id, customer_phone);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to ai logs"
  ON ai_usage_logs FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin can view ai logs"
  ON ai_usage_logs FOR SELECT
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

CREATE POLICY "Service can insert ai logs"
  ON ai_usage_logs FOR INSERT
  WITH CHECK (true);

-- Aylık AI özet görünümü
CREATE OR REPLACE VIEW ai_usage_monthly AS
SELECT
  company_id,
  DATE_TRUNC('month', created_at) AS month,
  COUNT(*) FILTER (WHERE NOT skipped) AS api_calls,
  COUNT(*) FILTER (WHERE skipped) AS skipped_calls,
  COUNT(*) FILTER (WHERE cached) AS cached_hits,
  SUM(total_tokens) AS total_tokens,
  SUM(prompt_tokens) AS prompt_tokens,
  SUM(completion_tokens) AS completion_tokens,
  ROUND(AVG(total_tokens) FILTER (WHERE NOT skipped AND NOT cached), 0) AS avg_tokens_per_call
FROM ai_usage_logs
GROUP BY company_id, DATE_TRUNC('month', created_at);
