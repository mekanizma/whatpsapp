-- Phone blacklist: company admins can block customers from messaging

CREATE TABLE IF NOT EXISTS phone_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_phone_blacklist_company_phone
  ON phone_blacklist(company_id, phone);

ALTER TABLE phone_blacklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to phone blacklist"
  ON phone_blacklist FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin can manage phone blacklist"
  ON phone_blacklist FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');
