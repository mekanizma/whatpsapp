-- Migration 065: Track last staff assignee on support tickets (survives transfer)

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS last_assigned_staff UUID REFERENCES staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_last_assigned_staff ON tickets(last_assigned_staff);

UPDATE tickets
SET last_assigned_staff = assigned_staff
WHERE assigned_staff IS NOT NULL
  AND last_assigned_staff IS NULL;
