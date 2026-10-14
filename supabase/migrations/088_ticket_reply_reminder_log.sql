-- Migration 088: Cevapsız destek talebi 24s pencere hatırlatma logu
-- Son müşteri mesajından 23. saatte (pencere kapanmadan 1 saat önce) e-posta; tekrar gönderimi önler.

CREATE TABLE IF NOT EXISTS ticket_reply_reminder_log (
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  window_closes_at TIMESTAMPTZ NOT NULL,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ticket_id, window_closes_at)
);

CREATE INDEX IF NOT EXISTS idx_ticket_reply_reminder_log_notified_at
  ON ticket_reply_reminder_log (notified_at);

ALTER TABLE ticket_reply_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to ticket reply reminder log"
  ON ticket_reply_reminder_log FOR ALL
  USING (is_super_admin());

COMMENT ON TABLE ticket_reply_reminder_log IS
  'Cevapsız destek talebi 24s hatırlatma e-postası dedupe — pencere (son müşteri mesajı) bazlı';
