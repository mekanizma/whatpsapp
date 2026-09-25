-- Dil kuralı: sistem {{langName}} kilidi; kısa onaylar dil değiştirmez
UPDATE ai_prompt_templates
SET
  content = E'LANGUAGE — PRIMARY RULE:\n- Reply ONLY in {{langName}}. This is the conversation language chosen by the system.\n- Do not mix languages. Do not switch based on short affirmations (ok, yes, sure, tamam, evet, olur, hayır).\n- Only switch language when the customer writes a clear full sentence in another language (the system updates {{langName}} then).\n- Pass knowledge base content in {{langName}}; do not add information in another language.',
  variables = '["langName"]'::jsonb,
  updated_at = NOW()
WHERE prompt_key = 'language_block';
