-- Migration 054: Abonelik paketi İngilizce metinleri (otomatik çeviri)

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS name_en TEXT,
  ADD COLUMN IF NOT EXISTS description_en TEXT,
  ADD COLUMN IF NOT EXISTS features_en JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN subscription_plans.name_en IS 'Paket adı (İngilizce, admin kaydında otomatik üretilir)';
COMMENT ON COLUMN subscription_plans.description_en IS 'Paket açıklaması (İngilizce)';
COMMENT ON COLUMN subscription_plans.features_en IS 'Paket özellikleri (İngilizce JSON dizi)';
