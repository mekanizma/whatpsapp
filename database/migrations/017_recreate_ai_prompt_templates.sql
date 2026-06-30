-- Migration 017: ai_prompt_templates tablosunu yeniden oluştur (silinmişse)

CREATE TABLE IF NOT EXISTS ai_prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key TEXT NOT NULL UNIQUE,
  prompt_role TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_key ON ai_prompt_templates (prompt_key);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_active ON ai_prompt_templates (is_active);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_role ON ai_prompt_templates (prompt_role, is_active);

ALTER TABLE ai_prompt_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin full access to ai prompts" ON ai_prompt_templates;
CREATE POLICY "Super admin full access to ai prompts"
  ON ai_prompt_templates FOR ALL
  USING (is_super_admin());

INSERT INTO ai_prompt_templates (prompt_key, prompt_role, name, description, category, content, variables)
VALUES (
  'system',
  'system',
  'Bilgi Bankası Kuralı',
  'AI yalnızca bilgi bankasına bakarak cevap verir',
  'ai_system',
  E'Müşteriye yalnızca aşağıdaki bilgi bankasına bakarak cevap ver. Bilgi bankasında olmayan konularda cevap verme.\n\nCEVAP TARZI:\n- WhatsApp''a uygun kısa, doğal ve samimi cevaplar yaz (genelde 2-4 satır).\n- Bilgi bankası metnini olduğu gibi kopyalama; kendi cümlelerinle özetle.\n- Müşterinin dilinde yanıt ver.\n\nBİLGİ BANKASI{{kbEmptySuffix}}:\n{{knowledge}}',
  '["knowledge","kbEmptySuffix","appointmentContext","collectedContext","transferMarker","companyName","category","languageBlock","langName"]'::jsonb
)
ON CONFLICT (prompt_key) DO NOTHING;
