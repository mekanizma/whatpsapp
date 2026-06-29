-- Migration 010: Mükerrer ticket ve WhatsApp mesaj önleme

-- Mükerrer açık ticketları temizle (en eskisini tut)
DELETE FROM tickets t
USING tickets dup
WHERE t.company_id = dup.company_id
  AND t.customer_phone = dup.customer_phone
  AND t.status IN ('open', 'in_progress')
  AND dup.status IN ('open', 'in_progress')
  AND t.id > dup.id;

-- Aynı müşteri için tek açık ticket
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_one_open_per_customer
  ON tickets (company_id, customer_phone)
  WHERE status IN ('open', 'in_progress');

-- Mevcut mükerrer WhatsApp mesajlarını temizle (en eskisini tut)
DELETE FROM messages m
USING messages dup
WHERE m.company_id = dup.company_id
  AND m.whatsapp_message_id = dup.whatsapp_message_id
  AND m.whatsapp_message_id IS NOT NULL
  AND m.id > dup.id;

-- Aynı WhatsApp mesajı iki kez işlenmesin
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_whatsapp_id_unique
  ON messages (company_id, whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;
