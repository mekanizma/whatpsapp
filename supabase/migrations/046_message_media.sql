-- Migration 046: Mesaj medya desteği (resim gönderme/alma)

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_path TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT,
  ADD COLUMN IF NOT EXISTS media_filename TEXT;

-- ============================================================
-- STORAGE BUCKET: message-media
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-media',
  'message-media',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Service role manages message media"
  ON storage.objects FOR ALL
  USING (bucket_id = 'message-media')
  WITH CHECK (bucket_id = 'message-media');
