-- Randevu konusu bir bilgi bankası sorusu değildir; akış handoff'a sapmamalı.
-- appointment_data alan adlarını backend parser'ın kanonik alanlarıyla eşleştir.

UPDATE ai_prompt_templates
SET
  content = REPLACE(
    REPLACE(
      content,
      '4) Bilgi bankası dışında bilgi verme.',
      E'4) Bilgi bankası dışında bilgi verme.\n- Müşterinin verdiği \"Randevu Konusu\" bir bilgi sorusu değildir; yalnızca randevu kaydının konu alanıdır. Konu bilgi bankasında bulunmasa bile temsilci teklif etme, akışı tarih ve saat bilgilerini isteyerek sürdür.'
    ),
    '{"name": null, "phone": null, "topic": null,',
    '{"customer_name": null, "customer_phone": null, "title": null,'
  ),
  variables = (
    SELECT jsonb_agg(DISTINCT value)
    FROM jsonb_array_elements(
      COALESCE(variables, '[]'::jsonb) ||
      '["currentDate","currentDayName","currentTime"]'::jsonb
    )
  ),
  version = version + 1,
  updated_at = NOW()
WHERE prompt_role = 'appointment'
  AND is_active = true
  AND content NOT LIKE '%Randevu Konusu%bir bilgi sorusu değildir%';
