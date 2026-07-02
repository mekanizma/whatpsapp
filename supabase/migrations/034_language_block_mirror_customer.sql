-- Dil kuralı: müşteri mesajına göre yanıt; bilgi bankası dilinden bağımsız
UPDATE ai_prompt_templates
SET
  content = E'LANGUAGE — PRIMARY RULE:\n- Always reply in the same language as the customer''s most recent message, regardless of the knowledge base language.\n- Detected language hint: {{langName}}. Use this only as a hint; mirror the customer''s actual wording language.\n- If the customer switches language, switch immediately.\n- Pass knowledge base content in the customer''s language; do not add information in another language.',
  variables = '["langName"]'::jsonb,
  updated_at = NOW()
WHERE prompt_key = 'language_block';
