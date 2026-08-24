-- Per WhatsApp account AI settings: ai_enabled, custom_instructions, knowledge links

ALTER TABLE whatsapp_configs
  ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS custom_instructions TEXT NULL;

COMMENT ON COLUMN whatsapp_configs.ai_enabled IS
  'NULL = inherit companies.ai_enabled; true/false overrides for this WhatsApp line';
COMMENT ON COLUMN whatsapp_configs.custom_instructions IS
  'NULL = inherit companies.custom_instructions; non-null overrides for this WhatsApp line';

CREATE TABLE IF NOT EXISTS whatsapp_account_knowledge (
  whatsapp_account_id UUID NOT NULL REFERENCES whatsapp_configs(id) ON DELETE CASCADE,
  knowledge_base_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (whatsapp_account_id, knowledge_base_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_account_knowledge_kb
  ON whatsapp_account_knowledge(knowledge_base_id);

CREATE INDEX IF NOT EXISTS idx_wa_account_knowledge_company
  ON whatsapp_account_knowledge(company_id);

ALTER TABLE whatsapp_account_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to wa account knowledge"
  ON whatsapp_account_knowledge FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin can manage wa account knowledge"
  ON whatsapp_account_knowledge FOR ALL
  USING (
    company_id = get_user_company_id()
    AND get_user_role() = 'company_admin'
  );

CREATE POLICY "Company members can view wa account knowledge"
  ON whatsapp_account_knowledge FOR SELECT
  USING (company_id = get_user_company_id());
