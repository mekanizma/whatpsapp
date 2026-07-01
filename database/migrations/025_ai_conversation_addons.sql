-- Migration 025: Ek AI görüşme paketleri

CREATE TABLE IF NOT EXISTS ai_conversation_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  conversation_count INT NOT NULL CHECK (conversation_count > 0),
  price DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'TRY',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_conversation_addon_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  addon_id UUID NOT NULL REFERENCES ai_conversation_addons(id) ON DELETE RESTRICT,
  conversation_count INT NOT NULL CHECK (conversation_count > 0),
  price_paid DECIMAL(10, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_addon_purchases_company
  ON ai_conversation_addon_purchases(company_id, created_at DESC);

INSERT INTO ai_conversation_addons (name, conversation_count, price, currency, sort_order)
SELECT * FROM (VALUES
  ('500 AI Görüşme Paketi', 500, 99.00, 'TRY', 1),
  ('1.000 AI Görüşme Paketi', 1000, 179.00, 'TRY', 2),
  ('2.500 AI Görüşme Paketi', 2500, 399.00, 'TRY', 3)
) AS v(name, conversation_count, price, currency, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM ai_conversation_addons LIMIT 1);
