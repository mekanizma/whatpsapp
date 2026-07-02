-- Migration 029: Fatura şablonu — admin panelden tam düzenleme

ALTER TABLE platform_invoice_settings
  ADD COLUMN IF NOT EXISTS template_config JSONB NOT NULL DEFAULT '{}'::jsonb;
