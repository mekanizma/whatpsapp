-- Migration 052: Kayıt başvuruları (şifresiz başvuru formu)

CREATE TYPE signup_application_status AS ENUM ('pending', 'reviewed', 'approved', 'rejected');

CREATE TABLE IF NOT EXISTS signup_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL CHECK (char_length(trim(company_name)) > 0),
  category company_category NOT NULL DEFAULT 'diger',
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) > 0),
  phone TEXT,
  email TEXT NOT NULL CHECK (char_length(trim(email)) > 0),
  status signup_application_status NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  whatsapp_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signup_applications_status
  ON signup_applications(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signup_applications_email
  ON signup_applications(lower(email));

CREATE TRIGGER trg_signup_applications_updated_at
  BEFORE UPDATE ON signup_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE signup_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access signup applications"
  ON signup_applications FOR ALL
  USING (is_super_admin());
