-- Migration 007: Örnek şirket ve başlangıç verileri
-- Platform ilk kurulumda kullanılacak demo şirket

-- Örnek şirket (KKTC klinik)
INSERT INTO companies (id, company_name, category, phone, email, address, subscription_plan, status)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Demo Klinik KKTC',
  'klinik',
  '+905338123456',
  'info@demoklinik.com',
  'Lefkoşa, KKTC',
  'business',
  'active'
)
ON CONFLICT (id) DO NOTHING;

-- WhatsApp config kaydı
INSERT INTO whatsapp_configs (company_id, status)
VALUES ('a0000000-0000-0000-0000-000000000001', 'disconnected')
ON CONFLICT (company_id) DO NOTHING;

-- Abonelik kaydı
INSERT INTO subscriptions (company_id, plan_id, messages_limit, users_limit, status)
SELECT
  'a0000000-0000-0000-0000-000000000001',
  id,
  5000,
  5,
  'active'
FROM subscription_plans
WHERE plan_type = 'business'
ON CONFLICT (company_id) DO NOTHING;

-- Örnek bilgi bankası (yoksa ekle)
INSERT INTO knowledge_base (company_id, title, content, category)
SELECT 'a0000000-0000-0000-0000-000000000001', 'Fiyat Bilgileri',
  E'Diş temizliği: 1500 TL\nDolgu: 2000 TL\nKanal tedavisi: 3500 TL\nİmplant: 25000 TL\nDiş beyazlatma: 8000 TL', 'fiyatlar'
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_base WHERE company_id = 'a0000000-0000-0000-0000-000000000001' AND title = 'Fiyat Bilgileri'
);

INSERT INTO knowledge_base (company_id, title, content, category)
SELECT 'a0000000-0000-0000-0000-000000000001', 'Çalışma Saatleri',
  E'Pazartesi - Cuma: 09:00 - 18:00\nCumartesi: 09:00 - 14:00\nPazar: Kapalı', 'genel'
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_base WHERE company_id = 'a0000000-0000-0000-0000-000000000001' AND title = 'Çalışma Saatleri'
);

INSERT INTO knowledge_base (company_id, title, content, category)
SELECT 'a0000000-0000-0000-0000-000000000001', 'Adres ve İletişim',
  E'Adres: Lefkoşa, KKTC\nTelefon: +90 533 812 3456\nE-posta: info@demoklinik.com', 'genel'
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_base WHERE company_id = 'a0000000-0000-0000-0000-000000000001' AND title = 'Adres ve İletişim'
);

-- Örnek personel kayıtları
INSERT INTO staff (company_id, name, email, role) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Ayşe Yılmaz', 'ayse@demoklinik.com', 'agent'),
  ('a0000000-0000-0000-0000-000000000001', 'Mehmet Kaya', 'mehmet@demoklinik.com', 'supervisor')
ON CONFLICT (company_id, email) DO NOTHING;
