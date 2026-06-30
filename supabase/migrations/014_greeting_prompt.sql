-- Migration 014: Selamlama prompt şablonu

INSERT INTO ai_prompt_templates (prompt_key, name, description, category, content, variables)
SELECT
  'greeting',
  'Selamlama Mesajı',
  'Müşteri merhaba/selam yazdığında gönderilen karşılama metni',
  'ai_system',
  'Merhaba, ben AI destek asistanıyım. Bilgi bankamızdaki konularda size yardımcı olabilirim.',
  '["langName"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM ai_prompt_templates WHERE prompt_key = 'greeting'
);
