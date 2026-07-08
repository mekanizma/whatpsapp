-- Migration 057: Başvurudan oluşturulan hesap referansı

ALTER TABLE signup_applications
  ADD COLUMN IF NOT EXISTS provisioned_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_signup_applications_provisioned_company
  ON signup_applications(provisioned_company_id);

COMMENT ON COLUMN signup_applications.provisioned_company_id IS 'Bu başvurudan oluşturulan şirket hesabı';
