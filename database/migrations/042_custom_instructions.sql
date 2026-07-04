-- Migration 042: Per-tenant AI assistant custom instructions (tone/style only)

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS custom_instructions TEXT NULL;
