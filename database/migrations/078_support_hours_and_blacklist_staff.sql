-- Per-WhatsApp support hours + staff can manage phone blacklist

ALTER TABLE whatsapp_configs
  ADD COLUMN IF NOT EXISTS support_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS support_working_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS support_timezone TEXT,
  ADD COLUMN IF NOT EXISTS out_of_hours_message TEXT,
  ADD COLUMN IF NOT EXISTS out_of_hours_create_ticket BOOLEAN NOT NULL DEFAULT TRUE;

DROP POLICY IF EXISTS "Company admin can manage phone blacklist" ON phone_blacklist;

CREATE POLICY "Company members can manage phone blacklist"
  ON phone_blacklist FOR ALL
  USING (
    company_id = get_user_company_id()
    AND get_user_role() IN ('company_admin', 'staff')
  );
