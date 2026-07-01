-- Migration 022: Ticket WhatsApp notifications for company users

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE TABLE IF NOT EXISTS ticket_notification_recipients (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_notification_recipients_company
  ON ticket_notification_recipients(company_id);

ALTER TABLE ticket_notification_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to ticket notification recipients"
  ON ticket_notification_recipients FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin can manage ticket notification recipients"
  ON ticket_notification_recipients FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

CREATE POLICY "Company admin can view ticket notification recipients"
  ON ticket_notification_recipients FOR SELECT
  USING (company_id = get_user_company_id() AND get_user_role() IN ('company_admin', 'staff'));
