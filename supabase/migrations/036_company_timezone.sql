-- Migration 036: Per-tenant timezone for appointment scheduling

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/Istanbul';

UPDATE companies
SET timezone = 'Europe/Istanbul'
WHERE timezone IS NULL OR trim(timezone) = '';
