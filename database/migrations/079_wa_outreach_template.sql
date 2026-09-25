-- Migration 079: Meta onaylı müşteri outreach şablonu (24s / yeni mesaj)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS wa_outreach_template_name TEXT,
  ADD COLUMN IF NOT EXISTS wa_outreach_template_lang TEXT,
  ADD COLUMN IF NOT EXISTS wa_outreach_template_body TEXT;

COMMENT ON COLUMN companies.wa_outreach_template_name IS
  'Meta Business Manager onaylı WhatsApp şablon adı (değişken yoksa body components gönderilmez)';
COMMENT ON COLUMN companies.wa_outreach_template_lang IS
  'Şablon dil kodu (örn. en, tr)';
COMMENT ON COLUMN companies.wa_outreach_template_body IS
  'Panel önizlemesi için şablon metni (Meta şablon gövdesi ile aynı olmalı)';
