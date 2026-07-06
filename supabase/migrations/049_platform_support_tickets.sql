-- Migration 049: Platform support tickets (customers → platform admin)

CREATE TABLE IF NOT EXISTS platform_support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subject TEXT NOT NULL CHECK (char_length(trim(subject)) > 0),
  category TEXT NOT NULL DEFAULT 'general',
  priority ticket_priority NOT NULL DEFAULT 'medium',
  status ticket_status NOT NULL DEFAULT 'open',
  created_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS platform_support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES platform_support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'admin')),
  sender_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL CHECK (char_length(trim(message)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_support_tickets_company
  ON platform_support_tickets(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_support_tickets_status
  ON platform_support_tickets(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_support_messages_ticket
  ON platform_support_messages(ticket_id, created_at ASC);

CREATE TRIGGER trg_platform_support_tickets_updated_at
  BEFORE UPDATE ON platform_support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE platform_support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access platform support tickets"
  ON platform_support_tickets FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin manage own platform support tickets"
  ON platform_support_tickets FOR ALL
  USING (
    company_id = get_user_company_id()
    AND get_user_role() = 'company_admin'
  );

CREATE POLICY "Super admin full access platform support messages"
  ON platform_support_messages FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin access own platform support messages"
  ON platform_support_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_support_tickets t
      WHERE t.id = ticket_id
        AND t.company_id = get_user_company_id()
        AND get_user_role() = 'company_admin'
    )
  );
