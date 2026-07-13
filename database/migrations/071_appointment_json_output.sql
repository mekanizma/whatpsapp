-- Randevu LLM çıktısı: appointment_data bloğu yerine yapılandırılmış JSON (API şeması ile zorunlu).
-- Prompt metni yalnızca davranış talimatı; alan şeması kod tarafında response_format ile uygulanır.

UPDATE ai_prompt_templates
SET
  content = REPLACE(
    content,
    '<appointment_data>',
    '{"reply":"...","appointment":{"name":null,"phone":null,"topic":null,"date":null,"time":null},"action":"collect"}'
  ),
  version = version + 1,
  updated_at = NOW()
WHERE prompt_role = 'appointment'
  AND is_active = true
  AND content LIKE '%appointment_data%';

UPDATE ai_prompt_templates
SET
  content = content || E'\n\nYANIT FORMATI (zorunlu JSON):\n- reply: müşteriye mesaj\n- appointment: {name, phone, topic, date (YYYY-MM-DD), time (HH:MM)} — şu ana kadar bilinen tüm alanlar\n- action: collect | save | handoff | none\n- Müşteri onayladığında action=save; canlı temsilci gerektiğinde action=handoff; randevu dışı mesajda action=none\n- Tarih/saat yorumunu sen yap ("yarın", "17 olur", "doğrudur" vb.); kod parse etmez.',
  version = version + 1,
  updated_at = NOW()
WHERE prompt_role = 'appointment'
  AND is_active = true
  AND content NOT LIKE '%action: collect | save | handoff | none%';
