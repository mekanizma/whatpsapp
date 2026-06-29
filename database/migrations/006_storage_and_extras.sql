-- Migration 006: Storage bucket + ek ayarlar
-- Logo ve medya dosyaları için Supabase Storage

-- ============================================================
-- STORAGE BUCKET: company-assets
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-assets',
  'company-assets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS politikaları
CREATE POLICY "Public read company assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-assets');

CREATE POLICY "Authenticated users can upload company assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'company-assets'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Company admin can update own assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'company-assets'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Company admin can delete own assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'company-assets'
    AND auth.role() = 'authenticated'
  );

-- ============================================================
-- AUTH: E-posta onayı olmadan giriş (geliştirme kolaylığı)
-- Not: Production'da email confirmation açık tutulmalı
-- ============================================================

-- Realtime: messages tablosu (zaten ekliyse atla)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $$;

-- ============================================================
-- İndeks optimizasyonu
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
