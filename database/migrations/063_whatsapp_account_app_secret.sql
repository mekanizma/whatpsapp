-- Migration 063: Store Meta App Secret per WhatsApp Cloud API account

ALTER TABLE whatsapp_configs
  ADD COLUMN IF NOT EXISTS app_secret TEXT;
