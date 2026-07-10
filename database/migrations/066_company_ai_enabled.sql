-- Şirket düzeyinde yapay zeka aç/kapa (kapalıyken her görüşme otomatik talep açar)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN companies.ai_enabled IS 'false: AI yanıt vermez, gelen görüşmeler için otomatik destek talebi açılır';
