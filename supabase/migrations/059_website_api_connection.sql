-- Migration 059: Web sitesi API bağlantısı (ürün, fiyat, stok, gönderi)

ALTER TABLE ecommerce_settings
  ADD COLUMN IF NOT EXISTS api_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS api_auth_type TEXT NOT NULL DEFAULT 'bearer'
    CHECK (api_auth_type IN ('bearer', 'api_key', 'header')),
  ADD COLUMN IF NOT EXISTS api_auth_header_name TEXT DEFAULT 'Authorization',
  ADD COLUMN IF NOT EXISTS products_path TEXT DEFAULT '/products',
  ADD COLUMN IF NOT EXISTS product_search_path TEXT DEFAULT '/products/search',
  ADD COLUMN IF NOT EXISTS stock_path TEXT DEFAULT '/products/{sku}/stock',
  ADD COLUMN IF NOT EXISTS order_status_path TEXT DEFAULT '/orders/{orderNumber}',
  ADD COLUMN IF NOT EXISTS shipping_path TEXT DEFAULT '/shipping/{trackingNumber}',
  ADD COLUMN IF NOT EXISTS api_connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_test_status TEXT
    CHECK (last_test_status IS NULL OR last_test_status IN ('ok', 'failed', 'untested')),
  ADD COLUMN IF NOT EXISTS last_test_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_test_message TEXT;

COMMENT ON COLUMN ecommerce_settings.api_enabled IS 'Web sitesi API üzerinden canlı ürün/fiyat/stok sorgusu';
COMMENT ON COLUMN ecommerce_settings.products_path IS 'Ürün listesi endpoint yolu';
COMMENT ON COLUMN ecommerce_settings.product_search_path IS 'Ürün arama endpoint yolu (?q=)';
COMMENT ON COLUMN ecommerce_settings.stock_path IS 'Stok sorgusu yolu ({sku} yer tutucusu)';
COMMENT ON COLUMN ecommerce_settings.order_status_path IS 'Sipariş durumu yolu ({orderNumber})';
COMMENT ON COLUMN ecommerce_settings.shipping_path IS 'Kargo durumu yolu ({trackingNumber})';
