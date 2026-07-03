-- Migration 037: Multi-WhatsApp per company + departments

-- Remove 1:1 company constraint
ALTER TABLE whatsapp_configs DROP CONSTRAINT IF EXISTS whatsapp_configs_company_id_key;

-- Account metadata
ALTER TABLE whatsapp_configs
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS profile_name TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_company ON whatsapp_configs(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_configs_one_default
  ON whatsapp_configs(company_id) WHERE is_default = true;

-- Link QR sessions to specific accounts
ALTER TABLE whatsapp_qr_sessions
  ADD COLUMN IF NOT EXISTS whatsapp_account_id UUID REFERENCES whatsapp_configs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_whatsapp_qr_sessions_account
  ON whatsapp_qr_sessions(whatsapp_account_id, created_at DESC);

-- Track which line handled each message
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS whatsapp_account_id UUID REFERENCES whatsapp_configs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_account
  ON messages(company_id, whatsapp_account_id, created_at DESC);

-- Migrate legacy Baileys identity: baileys:{companyId} → baileys:{accountId}
UPDATE whatsapp_configs
SET business_account_id = 'baileys:' || id::text
WHERE business_account_id LIKE 'baileys:%'
  AND business_account_id <> 'baileys:' || id::text;

-- Ensure existing rows have a default account flag
UPDATE whatsapp_configs wc
SET is_default = true
WHERE is_default = false
  AND NOT EXISTS (
    SELECT 1 FROM whatsapp_configs other
    WHERE other.company_id = wc.company_id AND other.is_default = true
  );

-- ============================================================
-- DEPARTMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_departments_company ON departments(company_id);

CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Many-to-many: WhatsApp account ↔ departments
CREATE TABLE IF NOT EXISTS whatsapp_department_links (
  whatsapp_account_id UUID NOT NULL REFERENCES whatsapp_configs(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (whatsapp_account_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_dept_links_department ON whatsapp_department_links(department_id);

-- RLS
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_department_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to departments"
  ON departments FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin can manage departments"
  ON departments FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

CREATE POLICY "Company members can view departments"
  ON departments FOR SELECT
  USING (company_id = get_user_company_id());

CREATE POLICY "Super admin full access to wa dept links"
  ON whatsapp_department_links FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin can manage wa dept links"
  ON whatsapp_department_links FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM whatsapp_configs wc
      WHERE wc.id = whatsapp_department_links.whatsapp_account_id
        AND wc.company_id = get_user_company_id()
        AND get_user_role() = 'company_admin'
    )
  );

CREATE POLICY "Company members can view wa dept links"
  ON whatsapp_department_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM whatsapp_configs wc
      WHERE wc.id = whatsapp_department_links.whatsapp_account_id
        AND wc.company_id = get_user_company_id()
    )
  );
