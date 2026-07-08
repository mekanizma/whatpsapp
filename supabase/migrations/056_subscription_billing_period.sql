-- Migration 056: Abonelik faturalandırma dönemi (hesap bazlı)

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS billing_period TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_period IN ('monthly', 'yearly'));

COMMENT ON COLUMN subscriptions.billing_period IS 'Hesabın aktif faturalandırma dönemi (aylık / yıllık)';
