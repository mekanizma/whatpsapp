-- Migration 058: E-ticaret operasyonları (sipariş, kargo, sepet, iade)

CREATE TABLE IF NOT EXISTS ecommerce_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  store_name TEXT,
  store_url TEXT,
  provider TEXT NOT NULL DEFAULT 'manual'
    CHECK (provider IN ('manual', 'shopify', 'woocommerce', 'custom')),
  api_base_url TEXT,
  api_key TEXT,
  order_status_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  shipping_tracking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  cart_abandonment_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  returns_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  return_policy_text TEXT,
  cart_reminder_hours INTEGER NOT NULL DEFAULT 24,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ecommerce_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  customer_phone TEXT,
  customer_name TEXT,
  customer_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
    )),
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid', 'partially_refunded', 'refunded')),
  total_amount NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'TRY',
  items_summary TEXT,
  notes TEXT,
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_company_status
  ON ecommerce_orders(company_id, status, ordered_at DESC);

CREATE INDEX IF NOT EXISTS idx_ecommerce_orders_company_phone
  ON ecommerce_orders(company_id, customer_phone);

CREATE TABLE IF NOT EXISTS ecommerce_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id UUID REFERENCES ecommerce_orders(id) ON DELETE SET NULL,
  order_number TEXT,
  tracking_number TEXT NOT NULL,
  carrier TEXT,
  status TEXT NOT NULL DEFAULT 'label_created'
    CHECK (status IN (
      'label_created', 'in_transit', 'out_for_delivery', 'delivered', 'returned', 'exception'
    )),
  tracking_url TEXT,
  customer_phone TEXT,
  customer_name TEXT,
  estimated_delivery DATE,
  last_event TEXT,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, tracking_number)
);

CREATE INDEX IF NOT EXISTS idx_ecommerce_shipments_company_status
  ON ecommerce_shipments(company_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ecommerce_shipments_company_order
  ON ecommerce_shipments(company_id, order_number);

CREATE TABLE IF NOT EXISTS ecommerce_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_phone TEXT,
  customer_name TEXT,
  customer_email TEXT,
  cart_total NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'TRY',
  items_summary TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'abandoned'
    CHECK (status IN ('abandoned', 'reminded', 'recovered', 'expired')),
  external_cart_id TEXT,
  abandoned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reminded_at TIMESTAMPTZ,
  recovered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecommerce_carts_company_status
  ON ecommerce_carts(company_id, status, abandoned_at DESC);

CREATE TABLE IF NOT EXISTS ecommerce_return_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id UUID REFERENCES ecommerce_orders(id) ON DELETE SET NULL,
  order_number TEXT,
  customer_phone TEXT,
  customer_name TEXT,
  request_type TEXT NOT NULL DEFAULT 'return'
    CHECK (request_type IN ('return', 'exchange')),
  reason TEXT,
  items_summary TEXT,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN (
      'requested', 'approved', 'rejected', 'in_transit', 'received', 'refunded', 'completed', 'cancelled'
    )),
  staff_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecommerce_returns_company_status
  ON ecommerce_return_requests(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ecommerce_returns_company_phone
  ON ecommerce_return_requests(company_id, customer_phone);

COMMENT ON TABLE ecommerce_settings IS 'E-ticaret paket ayarları ve mağaza entegrasyonu';
COMMENT ON TABLE ecommerce_orders IS 'Sipariş durumu sorgulama kayıtları';
COMMENT ON TABLE ecommerce_shipments IS 'Kargo takip kayıtları';
COMMENT ON TABLE ecommerce_carts IS 'Terk edilen / hatırlatılan sepetler';
COMMENT ON TABLE ecommerce_return_requests IS 'İade ve değişim talepleri';

ALTER TABLE ecommerce_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecommerce_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecommerce_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecommerce_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecommerce_return_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access to ecommerce_settings"
  ON ecommerce_settings FOR ALL USING (is_super_admin());
CREATE POLICY "Company members can view ecommerce_settings"
  ON ecommerce_settings FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "Company admin can manage ecommerce_settings"
  ON ecommerce_settings FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

CREATE POLICY "Super admin full access to ecommerce_orders"
  ON ecommerce_orders FOR ALL USING (is_super_admin());
CREATE POLICY "Company members can view ecommerce_orders"
  ON ecommerce_orders FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "Company admin can manage ecommerce_orders"
  ON ecommerce_orders FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

CREATE POLICY "Super admin full access to ecommerce_shipments"
  ON ecommerce_shipments FOR ALL USING (is_super_admin());
CREATE POLICY "Company members can view ecommerce_shipments"
  ON ecommerce_shipments FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "Company admin can manage ecommerce_shipments"
  ON ecommerce_shipments FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

CREATE POLICY "Super admin full access to ecommerce_carts"
  ON ecommerce_carts FOR ALL USING (is_super_admin());
CREATE POLICY "Company members can view ecommerce_carts"
  ON ecommerce_carts FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "Company admin can manage ecommerce_carts"
  ON ecommerce_carts FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

CREATE POLICY "Super admin full access to ecommerce_return_requests"
  ON ecommerce_return_requests FOR ALL USING (is_super_admin());
CREATE POLICY "Company members can view ecommerce_return_requests"
  ON ecommerce_return_requests FOR SELECT USING (company_id = get_user_company_id());
CREATE POLICY "Company admin can manage ecommerce_return_requests"
  ON ecommerce_return_requests FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');
