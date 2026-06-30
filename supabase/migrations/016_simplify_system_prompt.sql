-- Migration 016: Sistem promptunu bilgi bankası odaklı minimal içeriğe güncelle

UPDATE ai_prompt_templates
SET
  name = 'Bilgi Bankası Kuralı',
  description = 'AI yalnızca bilgi bankasına bakarak cevap verir',
  content = E'Müşteriye yalnızca aşağıdaki bilgi bankasına bakarak cevap ver. Bilgi bankasında olmayan konularda cevap verme.\n\nCEVAP TARZI:\n- WhatsApp''a uygun kısa, doğal ve samimi cevaplar yaz (genelde 2-4 satır).\n- Bilgi bankası metnini olduğu gibi kopyalama; kendi cümlelerinle özetle.\n- Müşterinin dilinde yanıt ver.\n\nBİLGİ BANKASI{{kbEmptySuffix}}:\n{{knowledge}}',
  variables = '["knowledge","kbEmptySuffix","appointmentContext","collectedContext","transferMarker","companyName","category","languageBlock","langName"]'::jsonb,
  updated_at = NOW()
WHERE prompt_key = 'system';
