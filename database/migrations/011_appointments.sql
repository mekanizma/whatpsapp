-- Migration 011: Randevu takvimi

CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');
CREATE TYPE appointment_source AS ENUM ('ai', 'manual', 'panel');

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  title TEXT NOT NULL DEFAULT 'Randevu',
  notes TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status appointment_status NOT NULL DEFAULT 'confirmed',
  source appointment_source NOT NULL DEFAULT 'ai',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT appointments_time_check CHECK (ends_at > starts_at)
);

CREATE INDEX idx_appointments_company_starts ON appointments(company_id, starts_at);
CREATE INDEX idx_appointments_company_phone ON appointments(company_id, customer_phone);
CREATE INDEX idx_appointments_status ON appointments(company_id, status);

CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to appointments"
  ON appointments FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company members can view appointments"
  ON appointments FOR SELECT
  USING (company_id = get_user_company_id());

CREATE POLICY "Company admin can manage appointments"
  ON appointments FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

CREATE POLICY "Staff can manage appointments"
  ON appointments FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'staff');
