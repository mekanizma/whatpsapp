-- Migration 003: Row Level Security Policies
-- Multi-tenant data isolation

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES
-- ============================================================
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (user_id = auth.uid() OR is_super_admin());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Super admin can manage all profiles"
  ON profiles FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin can view company profiles"
  ON profiles FOR SELECT
  USING (
    company_id = get_user_company_id()
    AND get_user_role() IN ('company_admin', 'staff')
  );

-- ============================================================
-- COMPANIES
-- ============================================================
CREATE POLICY "Super admin full access to companies"
  ON companies FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company members can view own company"
  ON companies FOR SELECT
  USING (id = get_user_company_id());

CREATE POLICY "Company admin can update own company"
  ON companies FOR UPDATE
  USING (id = get_user_company_id() AND get_user_role() = 'company_admin');

-- ============================================================
-- WHATSAPP CONFIGS
-- ============================================================
CREATE POLICY "Super admin full access to whatsapp"
  ON whatsapp_configs FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin can manage whatsapp config"
  ON whatsapp_configs FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

CREATE POLICY "Company members can view whatsapp config"
  ON whatsapp_configs FOR SELECT
  USING (company_id = get_user_company_id());

-- ============================================================
-- KNOWLEDGE BASE
-- ============================================================
CREATE POLICY "Super admin full access to knowledge"
  ON knowledge_base FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin can manage knowledge"
  ON knowledge_base FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

CREATE POLICY "Company members can view knowledge"
  ON knowledge_base FOR SELECT
  USING (company_id = get_user_company_id());

-- ============================================================
-- STAFF
-- ============================================================
CREATE POLICY "Super admin full access to staff"
  ON staff FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin can manage staff"
  ON staff FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

CREATE POLICY "Company members can view staff"
  ON staff FOR SELECT
  USING (company_id = get_user_company_id());

-- ============================================================
-- TICKETS
-- ============================================================
CREATE POLICY "Super admin full access to tickets"
  ON tickets FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin can manage all tickets"
  ON tickets FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

CREATE POLICY "Staff can view and update assigned tickets"
  ON tickets FOR SELECT
  USING (company_id = get_user_company_id());

CREATE POLICY "Staff can update assigned tickets"
  ON tickets FOR UPDATE
  USING (
    company_id = get_user_company_id()
    AND get_user_role() = 'staff'
    AND assigned_staff IN (
      SELECT id FROM staff WHERE profile_id = (
        SELECT id FROM profiles WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE POLICY "Super admin full access to messages"
  ON messages FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin can manage all messages"
  ON messages FOR ALL
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

CREATE POLICY "Staff can view company messages"
  ON messages FOR SELECT
  USING (company_id = get_user_company_id());

CREATE POLICY "Staff can insert replies"
  ON messages FOR INSERT
  WITH CHECK (
    company_id = get_user_company_id()
    AND sender_type = 'staff'
  );

-- ============================================================
-- SUBSCRIPTION PLANS (public read)
-- ============================================================
CREATE POLICY "Anyone can view active plans"
  ON subscription_plans FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "Super admin can manage plans"
  ON subscription_plans FOR ALL
  USING (is_super_admin());

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
CREATE POLICY "Super admin full access to subscriptions"
  ON subscriptions FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company members can view own subscription"
  ON subscriptions FOR SELECT
  USING (company_id = get_user_company_id());

-- ============================================================
-- ACTIVITY LOGS
-- ============================================================
CREATE POLICY "Super admin full access to logs"
  ON activity_logs FOR ALL
  USING (is_super_admin());

CREATE POLICY "Company admin can view company logs"
  ON activity_logs FOR SELECT
  USING (company_id = get_user_company_id() AND get_user_role() = 'company_admin');

CREATE POLICY "Users can insert logs"
  ON activity_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Service role bypass (backend uses service role key)
-- RLS is bypassed when using SUPABASE_SERVICE_ROLE_KEY
