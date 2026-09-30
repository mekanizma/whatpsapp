-- Per-WhatsApp primary language and optional handoff waiting message.
-- Empty handoff_waiting_message keeps the localized template.
-- primary_language is used when the conversation language is not clear.

ALTER TABLE whatsapp_configs
  ADD COLUMN IF NOT EXISTS primary_language TEXT NOT NULL DEFAULT 'tr',
  ADD COLUMN IF NOT EXISTS handoff_waiting_message TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_configs_primary_language_check'
  ) THEN
    ALTER TABLE whatsapp_configs
      ADD CONSTRAINT whatsapp_configs_primary_language_check
      CHECK (primary_language IN ('tr', 'en', 'de', 'ar', 'ru', 'fr', 'es'));
  END IF;
END $$;
