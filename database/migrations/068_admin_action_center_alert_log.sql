-- Aksiyon merkezi alarm e-postalarında tekrar gönderimi önlemek için
CREATE TABLE IF NOT EXISTS admin_action_center_alert_log (
  alert_id TEXT PRIMARY KEY,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_action_center_alert_log_notified_at
  ON admin_action_center_alert_log (notified_at);

ALTER TABLE admin_action_center_alert_log ENABLE ROW LEVEL SECURITY;
