-- Migration 043: Personel mesajlarında gönderen adı

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_name TEXT;
