-- Migration 021: Plan para birimi ve özellik listesi

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY',
  ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN subscription_plans.currency IS 'ISO 4217 para birimi kodu (TRY, USD, EUR, GBP)';
COMMENT ON COLUMN subscription_plans.features IS 'Paket özellikleri — madde madde liste (JSON dizi)';

UPDATE subscription_plans
SET features = CASE plan_type
  WHEN 'starter' THEN '["1.000 AI görüşme / ay", "1 kullanıcı", "WhatsApp AI asistan"]'::jsonb
  WHEN 'business' THEN '["5.000 AI görüşme / ay", "5 kullanıcı", "Öncelikli destek"]'::jsonb
  WHEN 'enterprise' THEN '["Sınırsız AI görüşme", "Sınırsız kullanıcı", "Özel entegrasyon"]'::jsonb
  ELSE features
END
WHERE features = '[]'::jsonb OR features IS NULL;
