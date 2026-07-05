-- Migration 044: Security hardening
-- Privilege escalation, permissive RLS, secret column exposure, storage & RPC lockdown

-- ============================================================
-- 1. Signup: never trust user_metadata for role assignment
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (user_id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'staff'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 2. Block self-service role / company escalation on profiles
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_profile_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.role := OLD.role;
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    NEW.company_id := OLD.company_id;
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    NEW.is_active := OLD.is_active;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id cannot be changed';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_profiles_prevent_escalation ON profiles;
CREATE TRIGGER trg_profiles_prevent_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_profile_privilege_escalation();

-- ============================================================
-- 3. Remove permissive ai_response_cache policy (service role bypasses RLS)
-- ============================================================
DROP POLICY IF EXISTS "Service can manage ai response cache" ON ai_response_cache;

-- Backend service role inserts; authenticated users should not write usage logs directly
DROP POLICY IF EXISTS "Service can insert ai logs" ON ai_usage_logs;

-- ============================================================
-- 4. Hide WhatsApp secrets from direct PostgREST SELECT
-- ============================================================
REVOKE SELECT ON whatsapp_configs FROM anon, authenticated;

GRANT SELECT (
  id,
  company_id,
  phone_number,
  business_account_id,
  status,
  created_at,
  updated_at,
  label,
  profile_name,
  is_active,
  is_default,
  last_synced_at
) ON whatsapp_configs TO authenticated;

-- ============================================================
-- 5. Tighten storage policies (company-scoped writes)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can upload company assets" ON storage.objects;
DROP POLICY IF EXISTS "Company admin can update own assets" ON storage.objects;
DROP POLICY IF EXISTS "Company admin can delete own assets" ON storage.objects;

CREATE POLICY "Company admin can upload company assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'company-assets'
    AND auth.role() = 'authenticated'
    AND get_user_role() = 'company_admin'
    AND coalesce((storage.foldername(name))[1], '') = coalesce(get_user_company_id()::text, '')
  );

CREATE POLICY "Company admin can update own company assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'company-assets'
    AND auth.role() = 'authenticated'
    AND get_user_role() = 'company_admin'
    AND coalesce((storage.foldername(name))[1], '') = coalesce(get_user_company_id()::text, '')
  );

CREATE POLICY "Company admin can delete own company assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'company-assets'
    AND auth.role() = 'authenticated'
    AND get_user_role() = 'company_admin'
    AND coalesce((storage.foldername(name))[1], '') = coalesce(get_user_company_id()::text, '')
  );

-- ============================================================
-- 6. Addon tables — ensure RLS policies exist (remote drift fix)
-- ============================================================
ALTER TABLE ai_conversation_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversation_addon_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_addons_select_authenticated ON ai_conversation_addons;
DROP POLICY IF EXISTS ai_addons_admin_all ON ai_conversation_addons;
DROP POLICY IF EXISTS ai_addon_purchases_company_read ON ai_conversation_addon_purchases;

CREATE POLICY ai_addons_select_authenticated
  ON ai_conversation_addons FOR SELECT
  TO authenticated
  USING (
    is_active = TRUE
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY ai_addons_admin_all
  ON ai_conversation_addons FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY ai_addon_purchases_company_read
  ON ai_conversation_addon_purchases FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- ============================================================
-- 7. ai_usage_monthly view — respect caller RLS (Postgres 15+)
-- ============================================================
DROP VIEW IF EXISTS ai_usage_monthly;

CREATE VIEW ai_usage_monthly
WITH (security_invoker = true)
AS
SELECT
  company_id,
  DATE_TRUNC('month', created_at) AS month,
  COUNT(*) FILTER (WHERE NOT skipped) AS api_calls,
  COUNT(*) FILTER (WHERE skipped) AS skipped_calls,
  COUNT(*) FILTER (WHERE cached) AS cached_hits,
  SUM(total_tokens) AS total_tokens,
  SUM(prompt_tokens) AS prompt_tokens,
  SUM(completion_tokens) AS completion_tokens,
  ROUND(AVG(total_tokens) FILTER (WHERE NOT skipped AND NOT cached), 0) AS avg_tokens_per_call
FROM ai_usage_logs
GROUP BY company_id, DATE_TRUNC('month', created_at);

-- ============================================================
-- 8. Revoke public RPC on sensitive SECURITY DEFINER helpers
-- ============================================================
REVOKE ALL ON FUNCTION public.get_user_company_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_user_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.match_knowledge_chunks(
  uuid,
  vector,
  text,
  integer,
  double precision,
  double precision,
  double precision
) FROM PUBLIC, anon, authenticated;

-- Trigger-only function — not callable via PostgREST RPC
REVOKE ALL ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;
