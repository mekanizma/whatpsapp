-- Migration 018: Production hardening
-- Tehlikeli RPC fonksiyonlarını public API'den kapat, fonksiyon search_path sabitle

REVOKE EXECUTE ON FUNCTION public.setup_auth_user(text, text, text, public.user_role, uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.get_user_company_id() SET search_path = public;
ALTER FUNCTION public.get_user_role() SET search_path = public;
ALTER FUNCTION public.is_super_admin() SET search_path = public;
ALTER FUNCTION public.setup_auth_user(text, text, text, public.user_role, uuid) SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
