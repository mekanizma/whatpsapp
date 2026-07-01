-- Migration 026: AI bilgi bankasında olmayan sorular

CREATE TABLE IF NOT EXISTS unknown_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  question TEXT NOT NULL,
  ai_response TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'dismissed', 'added_to_kb')),
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  last_asked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unknown_questions_company_status
  ON unknown_questions(company_id, status, last_asked_at DESC);

CREATE INDEX IF NOT EXISTS idx_unknown_questions_company_phone
  ON unknown_questions(company_id, customer_phone);

COMMENT ON TABLE unknown_questions IS 'AI''ın bilgi bankasında bulamadığı müşteri soruları';

ALTER TABLE unknown_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to unknown_questions"
  ON unknown_questions FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company members can view unknown_questions"
  ON unknown_questions FOR SELECT
  USING (company_id = get_user_company_id());

CREATE POLICY "Company admin can manage unknown_questions"
  ON unknown_questions FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');
