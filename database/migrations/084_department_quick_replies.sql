-- Departman bazlı hazır cevap (quick reply) şablonları
-- Personel kendi departmanına cevap ekler; mesaj ekranından seçip gönderir.

CREATE TABLE IF NOT EXISTS quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quick_replies_title_not_empty CHECK (char_length(trim(title)) > 0),
  CONSTRAINT quick_replies_body_not_empty CHECK (char_length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_company_dept
  ON quick_replies(company_id, department_id);

CREATE INDEX IF NOT EXISTS idx_quick_replies_company_active
  ON quick_replies(company_id, is_active, sort_order);

ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to quick replies"
  ON quick_replies FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company members can manage quick replies"
  ON quick_replies FOR ALL
  USING (
    company_id = get_user_company_id()
    AND get_user_role() IN ('company_admin', 'staff')
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND get_user_role() IN ('company_admin', 'staff')
  );

COMMENT ON TABLE quick_replies IS
  'Departman bazlı hazır cevap şablonları — personel mesaj ekranından seçer';
