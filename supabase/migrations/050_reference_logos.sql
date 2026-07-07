-- Migration 050: Reference/customer logos shown on the public landing page

CREATE TABLE IF NOT EXISTS reference_logos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  logo_url TEXT NOT NULL,
  website TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reference_logos_order
  ON reference_logos(display_order ASC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reference_logos_active
  ON reference_logos(is_active, display_order ASC);

CREATE TRIGGER trg_reference_logos_updated_at
  BEFORE UPDATE ON reference_logos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE reference_logos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access reference logos"
  ON reference_logos FOR ALL
  USING (is_super_admin());

-- Herkese açık okuma (yalnızca aktif olanlar) — tanıtım sayfası için
CREATE POLICY "Public read active reference logos"
  ON reference_logos FOR SELECT
  USING (is_active = TRUE);
