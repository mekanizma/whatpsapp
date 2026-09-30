-- Admin Personel (staff.role = admin) = departman sorumlusu
-- Süper Personel (staff.role = supervisor) = şirket geneli + bilgi bankası
-- Bilgi bankası erişiminden admin çıkarılır; yalnızca supervisor kalır.

CREATE OR REPLACE FUNCTION can_access_knowledge()
RETURNS BOOLEAN AS $$
  SELECT
    get_user_role() = 'company_admin'
    OR (
      get_user_role() = 'staff'
      AND get_staff_sub_role() = 'supervisor'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "Super staff can manage knowledge" ON knowledge_base;
CREATE POLICY "Super staff can manage knowledge"
  ON knowledge_base FOR ALL
  USING (
    company_id = get_user_company_id()
    AND get_user_role() = 'staff'
    AND get_staff_sub_role() = 'supervisor'
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND get_user_role() = 'staff'
    AND get_staff_sub_role() = 'supervisor'
  );

DROP POLICY IF EXISTS "Super staff can manage knowledge documents" ON knowledge_documents;
CREATE POLICY "Super staff can manage knowledge documents"
  ON knowledge_documents FOR ALL
  USING (
    company_id = get_user_company_id()
    AND get_user_role() = 'staff'
    AND get_staff_sub_role() = 'supervisor'
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND get_user_role() = 'staff'
    AND get_staff_sub_role() = 'supervisor'
  );

DROP POLICY IF EXISTS "Super staff can manage knowledge chunks" ON knowledge_chunks;
CREATE POLICY "Super staff can manage knowledge chunks"
  ON knowledge_chunks FOR ALL
  USING (
    company_id = get_user_company_id()
    AND get_user_role() = 'staff'
    AND get_staff_sub_role() = 'supervisor'
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND get_user_role() = 'staff'
    AND get_staff_sub_role() = 'supervisor'
  );

COMMENT ON TYPE staff_role IS
  'agent=Personel, admin=Admin Personel (departman sorumlusu), supervisor=Süper Personel';
