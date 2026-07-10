-- Destek talepleri için Supabase Realtime (tarayıcı bildirimleri)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
  END IF;
END $$;
