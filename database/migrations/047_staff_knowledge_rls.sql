-- Migration 047: Staff sub-role RLS — bilgi bankası yalnızca süper personele
-- agent = normal personel (mesajlar + ayarlar)
-- supervisor / admin = süper personel (+ bilgi bankası)

-- ============================================================
-- Helper: oturum açmış personelin alt rolü
-- ============================================================
CREATE OR REPLACE FUNCTION get_staff_sub_role()
RETURNS staff_role AS $$
  SELECT s.role
  FROM staff s
  INNER JOIN profiles p ON p.id = s.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================
-- Helper: bilgi bankası erişimi (firma yöneticisi veya süper personel)
-- ============================================================
CREATE OR REPLACE FUNCTION can_access_knowledge()
RETURNS BOOLEAN AS $$
  SELECT
    get_user_role() = 'company_admin'
    OR (
      get_user_role() = 'staff'
      AND get_staff_sub_role() IN ('supervisor', 'admin')
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

ALTER FUNCTION public.get_staff_sub_role() SET search_path = public;
ALTER FUNCTION public.can_access_knowledge() SET search_path = public;

REVOKE ALL ON FUNCTION public.get_staff_sub_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_knowledge() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_sub_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_knowledge() TO authenticated;

-- ============================================================
-- knowledge_base
-- ============================================================
DROP POLICY IF EXISTS "Company members can view knowledge" ON knowledge_base;

CREATE POLICY "Super staff can manage knowledge"
  ON knowledge_base FOR ALL
  USING (
    company_id = get_user_company_id()
    AND get_user_role() = 'staff'
    AND get_staff_sub_role() IN ('supervisor', 'admin')
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND get_user_role() = 'staff'
    AND get_staff_sub_role() IN ('supervisor', 'admin')
  );

-- ============================================================
-- knowledge_documents
-- ============================================================
DROP POLICY IF EXISTS "Company members can view knowledge documents" ON knowledge_documents;

CREATE POLICY "Super staff can manage knowledge documents"
  ON knowledge_documents FOR ALL
  USING (
    company_id = get_user_company_id()
    AND get_user_role() = 'staff'
    AND get_staff_sub_role() IN ('supervisor', 'admin')
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND get_user_role() = 'staff'
    AND get_staff_sub_role() IN ('supervisor', 'admin')
  );

-- ============================================================
-- knowledge_chunks
-- ============================================================
DROP POLICY IF EXISTS "Company members can view knowledge chunks" ON knowledge_chunks;

CREATE POLICY "Super staff can manage knowledge chunks"
  ON knowledge_chunks FOR ALL
  USING (
    company_id = get_user_company_id()
    AND get_user_role() = 'staff'
    AND get_staff_sub_role() IN ('supervisor', 'admin')
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND get_user_role() = 'staff'
    AND get_staff_sub_role() IN ('supervisor', 'admin')
  );
