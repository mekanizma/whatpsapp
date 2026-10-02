-- Migration 086: WhatsApp sipariş oluşturma API yolu

ALTER TABLE ecommerce_settings
  ADD COLUMN IF NOT EXISTS order_create_path TEXT DEFAULT '/api/v1/orders';

COMMENT ON COLUMN ecommerce_settings.order_create_path IS 'POST sipariş oluşturma yolu (WhatsApp / Waai)';
