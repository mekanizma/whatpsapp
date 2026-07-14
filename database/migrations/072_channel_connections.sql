-- Migration 072: Channel-agnostic Meta connections (Messenger + Instagram DM)
-- WhatsApp remains on whatsapp_configs; new channels use channel_connections.
-- Idempotent: safe to re-run if types/tables already exist.

DO $$ BEGIN
  CREATE TYPE public.messaging_channel AS ENUM (
    'whatsapp',
    'facebook_messenger',
    'instagram_dm'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.channel_connection_status AS ENUM (
    'disconnected',
    'pending',
    'connected',
    'error'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.channel_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel public.messaging_channel NOT NULL,
  status public.channel_connection_status NOT NULL DEFAULT 'disconnected',
  label TEXT,
  -- Meta page / Instagram business account identifiers
  external_account_id TEXT,
  external_page_id TEXT,
  external_ig_user_id TEXT,
  account_name TEXT,
  page_name TEXT,
  -- Encrypted-at-rest via service role only; never expose via PostgREST SELECT *
  access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  refresh_token TEXT,
  -- Per-connection webhook verify (falls back to env WHATSAPP_VERIFY_TOKEN)
  webhook_verify_token TEXT,
  -- Inbound message processing toggle
  inbound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  connected_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_connections_company_channel_page
  ON public.channel_connections (company_id, channel, external_page_id)
  WHERE external_page_id IS NOT NULL;

-- Drop legacy global page uniqueness (same Page can back Messenger + Instagram)
DROP INDEX IF EXISTS public.idx_channel_connections_external_page;

-- Same Facebook Page may back both Messenger and Instagram (one row per channel)
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_connections_channel_page
  ON public.channel_connections (channel, external_page_id)
  WHERE external_page_id IS NOT NULL AND status = 'connected';

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_connections_ig_user
  ON public.channel_connections (external_ig_user_id)
  WHERE external_ig_user_id IS NOT NULL AND status = 'connected';

CREATE INDEX IF NOT EXISTS idx_channel_connections_company
  ON public.channel_connections (company_id);

CREATE INDEX IF NOT EXISTS idx_channel_connections_channel_status
  ON public.channel_connections (channel, status);

DROP TRIGGER IF EXISTS trg_channel_connections_updated_at ON public.channel_connections;
CREATE TRIGGER trg_channel_connections_updated_at
  BEFORE UPDATE ON public.channel_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin full access to channel_connections" ON public.channel_connections;
CREATE POLICY "Super admin full access to channel_connections"
  ON public.channel_connections FOR ALL
  USING (is_super_admin());

DROP POLICY IF EXISTS "Company admin can manage channel_connections" ON public.channel_connections;
CREATE POLICY "Company admin can manage channel_connections"
  ON public.channel_connections FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

DROP POLICY IF EXISTS "Company members can view channel_connections" ON public.channel_connections;
CREATE POLICY "Company members can view channel_connections"
  ON public.channel_connections FOR SELECT
  USING (company_id = get_user_company_id());

-- Hide tokens from PostgREST (backend uses service role)
REVOKE ALL ON public.channel_connections FROM anon;
REVOKE SELECT ON public.channel_connections FROM authenticated;
GRANT SELECT (
  id,
  company_id,
  channel,
  status,
  label,
  external_account_id,
  external_page_id,
  external_ig_user_id,
  account_name,
  page_name,
  webhook_verify_token,
  inbound_enabled,
  is_active,
  metadata,
  last_error,
  connected_at,
  last_synced_at,
  created_at,
  updated_at
) ON public.channel_connections TO authenticated;

-- Messages: optional channel metadata (WhatsApp rows stay NULL-compatible)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS channel public.messaging_channel NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS channel_connection_id UUID REFERENCES public.channel_connections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_company_channel
  ON public.messages (company_id, channel, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_channel_connection
  ON public.messages (channel_connection_id)
  WHERE channel_connection_id IS NOT NULL;

COMMENT ON TABLE public.channel_connections IS
  'Non-WhatsApp messaging channel connections (Facebook Messenger, Instagram DM). Extensible for Telegram/Web Chat.';
COMMENT ON COLUMN public.messages.channel IS
  'Inbound/outbound messaging channel; whatsapp by default for legacy rows.';
COMMENT ON COLUMN public.messages.channel_connection_id IS
  'FK to channel_connections for Meta and future channels; NULL for WhatsApp.';
