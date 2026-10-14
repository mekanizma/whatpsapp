-- Migration 087: Hat bazlı Meta outreach şablonları (24s pencere dışı)
-- Süper personel / şirket yöneticisi panelden hat başına birden fazla şablon tanımlayabilir.

CREATE TABLE IF NOT EXISTS wa_outreach_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  whatsapp_account_id UUID NOT NULL REFERENCES whatsapp_configs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  template_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  body TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wa_outreach_templates_title_not_empty CHECK (char_length(trim(title)) > 0),
  CONSTRAINT wa_outreach_templates_name_not_empty CHECK (char_length(trim(template_name)) > 0),
  CONSTRAINT wa_outreach_templates_body_not_empty CHECK (char_length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_wa_outreach_templates_company_account
  ON wa_outreach_templates(company_id, whatsapp_account_id);

CREATE INDEX IF NOT EXISTS idx_wa_outreach_templates_company_active
  ON wa_outreach_templates(company_id, is_active, sort_order);

ALTER TABLE wa_outreach_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to wa outreach templates"
  ON wa_outreach_templates FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company members can manage wa outreach templates"
  ON wa_outreach_templates FOR ALL
  USING (
    company_id = get_user_company_id()
    AND get_user_role() IN ('company_admin', 'staff')
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND get_user_role() IN ('company_admin', 'staff')
  );

COMMENT ON TABLE wa_outreach_templates IS
  'Hat bazlı Meta onaylı outreach şablonları — 24s pencere dışı / yeni mesaj';
COMMENT ON COLUMN wa_outreach_templates.template_name IS
  'Meta Business Manager onaylı WhatsApp şablon adı';
COMMENT ON COLUMN wa_outreach_templates.body IS
  'Panel önizlemesi ve QR/Baileys yedek metni (Meta şablon gövdesi ile aynı olmalı)';
