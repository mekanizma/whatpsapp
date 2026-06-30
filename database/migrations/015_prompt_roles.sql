-- Migration 015: Prompt rolleri — admin eklediği promptlar AI'da kullanılır

ALTER TABLE ai_prompt_templates
  ADD COLUMN IF NOT EXISTS prompt_role TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- Mevcut varsayılan anahtarları rollere eşle
UPDATE ai_prompt_templates SET prompt_role = 'greeting' WHERE prompt_key = 'greeting';
UPDATE ai_prompt_templates SET prompt_role = 'system' WHERE prompt_key = 'system';
UPDATE ai_prompt_templates SET prompt_role = 'appointment' WHERE prompt_key = 'appointment';
UPDATE ai_prompt_templates SET prompt_role = 'language' WHERE prompt_key = 'language_block';
UPDATE ai_prompt_templates SET prompt_role = 'translation' WHERE prompt_key = 'kb_translate';
UPDATE ai_prompt_templates SET prompt_role = 'custom' WHERE prompt_role IS NULL;

-- Test / geçersiz kayıtları temizle
DELETE FROM ai_prompt_templates
WHERE prompt_key IN ('api_test', 'test_prompt')
   OR (prompt_role = 'custom' AND content IN ('hello updated', 'test content'));

CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_role ON ai_prompt_templates (prompt_role, is_active);
