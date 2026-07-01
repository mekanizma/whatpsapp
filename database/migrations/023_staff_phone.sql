-- Migration 023: Staff phone for WhatsApp notifications

ALTER TABLE staff ADD COLUMN IF NOT EXISTS phone TEXT;
