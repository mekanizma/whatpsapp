-- Migration 053: Özel abonelik paketleri — plan_type enum kısıtını kaldır

ALTER TABLE subscription_plans
  ALTER COLUMN plan_type TYPE TEXT USING plan_type::TEXT;

ALTER TABLE companies
  ALTER COLUMN subscription_plan TYPE TEXT USING subscription_plan::TEXT;

COMMENT ON COLUMN subscription_plans.plan_type IS 'Benzersiz paket kodu (örn. starter, pro, custom_premium)';
