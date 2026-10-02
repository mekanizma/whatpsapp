-- Per WhatsApp line: use company website API for AI replies (e-commerce package)

ALTER TABLE whatsapp_configs
  ADD COLUMN IF NOT EXISTS website_api_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN whatsapp_configs.website_api_enabled IS
  'When true and company ecommerce API is configured, this WhatsApp line may query the live website API for product/order/shipping answers (in addition to knowledge base). When false, this line uses knowledge base / local ecommerce data only.';
