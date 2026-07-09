-- Migration 060: handle_new_user trigger search_path düzeltmesi
-- Auth şemasından tetiklenince public.company_category / user_role bulunamıyordu;
-- admin panelinden giriş hesabı oluşturma (createUser) 500/400 ile başarısız oluyordu.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name    TEXT;
  v_phone        TEXT;
  v_company_name TEXT;
  v_category     public.company_category;
  v_company_id   UUID;
  v_role         public.user_role;
  v_plan         public.subscription_plans%ROWTYPE;
BEGIN
  v_full_name    := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email);
  v_phone        := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '');
  v_company_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'), '');

  BEGIN
    v_category := COALESCE((NEW.raw_user_meta_data->>'category')::public.company_category, 'diger');
  EXCEPTION WHEN OTHERS THEN
    v_category := 'diger';
  END;

  BEGIN
    v_role := (NEW.raw_user_meta_data->>'role')::public.user_role;
  EXCEPTION WHEN OTHERS THEN
    v_role := NULL;
  END;

  IF v_role IS NULL THEN
    v_role := CASE
      WHEN v_company_name IS NOT NULL THEN 'company_admin'::public.user_role
      ELSE 'staff'::public.user_role
    END;
  END IF;

  IF v_company_name IS NOT NULL THEN
    INSERT INTO public.companies (company_name, category, phone, email, status)
    VALUES (v_company_name, v_category, v_phone, NEW.email, 'trial')
    RETURNING id INTO v_company_id;

    SELECT * INTO v_plan
    FROM public.subscription_plans
    WHERE plan_type = 'starter' AND is_active = TRUE
    LIMIT 1;

    IF v_plan.id IS NOT NULL THEN
      INSERT INTO public.subscriptions (company_id, plan_id, messages_limit, users_limit, status)
      VALUES (v_company_id, v_plan.id, v_plan.message_limit, v_plan.user_limit, 'trial');
    END IF;

    INSERT INTO public.whatsapp_configs (company_id)
    VALUES (v_company_id);
  END IF;

  INSERT INTO public.profiles (user_id, full_name, role, company_id, phone)
  VALUES (NEW.id, v_full_name, v_role, v_company_id, v_phone);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.profiles (user_id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email),
    'staff'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
