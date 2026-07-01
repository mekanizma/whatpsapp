-- Migration 021: Plan para birimi ve özellik listesi

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY',
  ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN subscription_plans.currency IS 'ISO 4217 para birimi kodu (TRY, USD, EUR, GBP)';
COMMENT ON COLUMN subscription_plans.features IS 'Paket özellikleri — madde madde liste (JSON dizi)';
