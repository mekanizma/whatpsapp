-- Migration 027: Platform fatura satıcı ayarları (admin panel)

CREATE TABLE IF NOT EXISTS platform_invoice_settings (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  issuer_name TEXT NOT NULL DEFAULT 'MEKANİZMA',
  legal_name TEXT NOT NULL DEFAULT 'MEKANİZMA Yazılım ve Teknoloji A.Ş.',
  address TEXT NOT NULL DEFAULT 'Türkiye',
  tax_office TEXT NOT NULL DEFAULT '—',
  tax_number TEXT NOT NULL DEFAULT '—',
  email TEXT NOT NULL DEFAULT 'fatura@mekanizma.com',
  phone TEXT NOT NULL DEFAULT '—',
  website TEXT NOT NULL DEFAULT 'mekanizma.com',
  vat_rate DECIMAL(5, 2) NOT NULL DEFAULT 20.00 CHECK (vat_rate >= 0 AND vat_rate <= 100),
  footer_note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID
);

INSERT INTO platform_invoice_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE platform_invoice_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_invoice_settings_super_admin ON platform_invoice_settings;
CREATE POLICY platform_invoice_settings_super_admin
  ON platform_invoice_settings
  FOR ALL
  USING (is_super_admin());
