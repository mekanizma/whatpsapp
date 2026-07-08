-- Migration 055: Başvuru formuna paket seçimi

ALTER TABLE signup_applications
  ADD COLUMN IF NOT EXISTS subscription_plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_period TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_period IN ('monthly', 'yearly'));

CREATE INDEX IF NOT EXISTS idx_signup_applications_plan
  ON signup_applications(subscription_plan_id);
