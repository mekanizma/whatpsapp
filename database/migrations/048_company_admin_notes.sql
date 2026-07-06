-- Migration 048: Super admin internal notes per company (not visible to customers)

CREATE TABLE IF NOT EXISTS company_admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(trim(content)) > 0),
  author_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT 'Platform Admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_admin_notes_company
  ON company_admin_notes(company_id, created_at DESC);

ALTER TABLE company_admin_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to company admin notes"
  ON company_admin_notes FOR ALL
  USING (is_super_admin());
