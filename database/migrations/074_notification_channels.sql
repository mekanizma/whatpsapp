-- Migration 074: Per-staff WhatsApp / email notification channels

ALTER TABLE ticket_notification_recipients
  ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE ticket_notification_recipients
  ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN NOT NULL DEFAULT false;
