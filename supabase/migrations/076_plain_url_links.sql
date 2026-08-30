-- WhatsApp mesajlarında linkler düz URL olarak yazılmalı (markdown [text](url) değil)

UPDATE ai_prompt_templates
SET
  content = content || E'\n- Linkleri [metin](url) markdown formatında yazma; doğrudan düz URL olarak yaz (ör. https://example.com/path).',
  updated_at = NOW()
WHERE prompt_key = 'system'
  AND content NOT LIKE '%düz URL olarak yaz%';
