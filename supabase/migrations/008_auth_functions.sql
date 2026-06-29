-- Migration 008: Auth kullanıcıları ve profil bağlantıları
-- Şifre: kurulum sonrası değiştirin (bcrypt hash aşağıda ChangeMe2026! için)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Yardımcı: kullanıcı oluştur veya güncelle
CREATE OR REPLACE FUNCTION setup_auth_user(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_role user_role,
  p_company_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, recovery_sent_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      p_email,
      crypt(p_password, gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', p_full_name, 'role', p_role),
      NOW(), NOW(), '', '', '', ''
    );

    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_user_id::text,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', p_email),
      'email',
      NOW(), NOW(), NOW()
    );
  END IF;

  INSERT INTO profiles (user_id, full_name, role, company_id, is_active)
  VALUES (v_user_id, p_full_name, p_role, p_company_id, true)
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    company_id = EXCLUDED.company_id,
    is_active = true;

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Kullanıcılar (şifre migration içinde değil, aşağıdaki SELECT ile çalıştırılır)
-- setup_auth_user çağrıları 008b migration'da yapılacak
