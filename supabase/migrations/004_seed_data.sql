-- Migration 004: Seed Data
-- Default subscription plans and initial configuration

INSERT INTO subscription_plans (plan_type, name, description, message_limit, user_limit, price_monthly) VALUES
  ('starter', 'Starter', 'Küçük işletmeler için başlangıç paketi', 1000, 1, 499.00),
  ('business', 'Business', 'Orta ölçekli işletmeler için', 5000, 5, 1499.00),
  ('enterprise', 'Enterprise', 'Büyük işletmeler için sınırsız paket', 999999, 999, 4999.00);
