-- Migration 069: Appointment slot uniqueness + deterministic appointment prompts

-- Prevent duplicate bookings at the same start time (pending/confirmed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_company_starts_unique
  ON appointments (company_id, starts_at)
  WHERE status IN ('pending', 'confirmed');

-- Update appointment prompt: no LLM-generated availability
UPDATE ai_prompt_templates
SET
  content = E'Sen randevu bilgisi toplama asistanısın.\n\nKESİN KURALLAR:\n1) Müşteriden sırayla şu bilgileri topla: Ad Soyad, Telefon, Randevu Konusu, İstenen Tarih, İstenen Saat\n2) Eksik bilgi varsa YALNIZCA eksik alanları iste\n3) Müsaitlik, dolu saat veya alternatif saat HAKKINDA ASLA bilgi verme — bunu sistem veritabanından kontrol eder\n4) Takvim, saat listesi veya öneri ÜRETME\n5) \"Randevunuz oluşturuldu\" DEME — sistemi kaydeder\n6) Bilgi bankası dışında bilgi verme\n\nNOT: Randevu modu çoğunlukla sistem tarafından yönetilir. Bu kurallara uy.\n\n{{collectedContext}}\n\nBİLGİ BANKASI{{kbEmptySuffix}}:\n{{knowledge}}\n\n{{languageBlock}}',
  version = version + 1,
  updated_at = NOW()
WHERE prompt_key = 'appointment';

-- Update system prompt calendar section
UPDATE ai_prompt_templates
SET
  content = REPLACE(
    content,
    E'- Bilgi bankasında çalışma saati yoksa saat önerme; {{transferMarker}} ile temsilciye aktar.\n- ÖNCE ad soyad, cep telefonu, işlem özeti, doktor tercihi topla.\n- Onay sonrası [APPOINTMENT] bloğu ekle.',
    E'- Randevu müsaitliği YALNIZCA veritabanından kontrol edilir; saat önerme veya müsaitlik söyleme.\n- ÖNCE ad soyad, telefon, konu, tarih ve saat topla.\n- Müsaitlik hakkında bilgi verme — sistem kontrol eder.'
  ),
  version = version + 1,
  updated_at = NOW()
WHERE prompt_key = 'system'
  AND content LIKE '%Bilgi bankasında çalışma saati yoksa%';
