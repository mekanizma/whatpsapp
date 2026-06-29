-- Migration 005: WhatsApp QR connection sessions
-- Stores QR pairing sessions for WhatsApp line connection

CREATE TYPE qr_session_status AS ENUM ('pending', 'scanned', 'connected', 'expired', 'failed');

CREATE TABLE whatsapp_qr_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  qr_payload TEXT NOT NULL,
  status qr_session_status NOT NULL DEFAULT 'pending',
  phone_number TEXT,
  display_name TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_qr_sessions_company ON whatsapp_qr_sessions(company_id, created_at DESC);
CREATE INDEX idx_whatsapp_qr_sessions_token ON whatsapp_qr_sessions(session_token);

ALTER TABLE whatsapp_qr_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to qr sessions"
  ON whatsapp_qr_sessions FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin can manage qr sessions"
  ON whatsapp_qr_sessions FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

CREATE POLICY "Company members can view qr sessions"
  ON whatsapp_qr_sessions FOR SELECT
  USING (company_id = get_user_company_id());
