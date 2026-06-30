-- Migration 012: Randevu doktor tercihi

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS preferred_doctor TEXT;
