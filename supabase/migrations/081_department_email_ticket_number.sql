-- Departman genel e-posta + bildirim aç/kapa; taleplere şirket içi sıra numarası

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS notify_email_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN departments.email IS 'Departman genel bildirim e-postası';
COMMENT ON COLUMN departments.notify_email_enabled IS 'Yeni taleplerde departman e-postasına bildirim gönderilsin mi';

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS ticket_number INT;

-- Mevcut taleplere şirket bazlı sıra numarası ata
WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at ASC, id ASC) AS rn
  FROM tickets
  WHERE ticket_number IS NULL
)
UPDATE tickets t
SET ticket_number = numbered.rn
FROM numbered
WHERE t.id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_company_ticket_number
  ON tickets(company_id, ticket_number);

-- Yeni taleplere otomatik sıra numarası
CREATE OR REPLACE FUNCTION assign_ticket_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    SELECT COALESCE(MAX(ticket_number), 0) + 1
      INTO NEW.ticket_number
      FROM tickets
     WHERE company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tickets_assign_number ON tickets;
CREATE TRIGGER trg_tickets_assign_number
  BEFORE INSERT ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION assign_ticket_number();
