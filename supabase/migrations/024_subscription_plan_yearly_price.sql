-- Migration 024: Yıllık paket fiyatı

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS price_yearly DECIMAL(10, 2);

COMMENT ON COLUMN subscription_plans.price_yearly IS 'Yıllık abonelik fiyatı (boş = yıllık plan sunulmaz)';

UPDATE subscription_plans
SET price_yearly = ROUND(price_monthly * 10, 2)
WHERE price_yearly IS NULL AND price_monthly > 0;
