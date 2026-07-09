-- Migration 061: MEKANİZMA şirket admin giriş e-postasını güncelle
-- firma@demoklinik.com -> info@mekanizma.com

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'firma@demoklinik.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = 'info@mekanizma.com'
    LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Hedef auth kullanıcısı bulunamadı, e-posta güncellemesi atlandı';
    RETURN;
  END IF;

  UPDATE auth.users
  SET
    email = 'info@mekanizma.com',
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
  WHERE id = v_user_id;

  UPDATE auth.identities
  SET
    identity_data = jsonb_set(
      jsonb_set(identity_data, '{email}', '"info@mekanizma.com"'),
      '{email_verified}', 'true'
    ),
    updated_at = NOW()
  WHERE user_id = v_user_id
    AND provider = 'email';

  UPDATE public.companies
  SET email = 'info@mekanizma.com', updated_at = NOW()
  WHERE id = 'a0000000-0000-0000-0000-000000000001';
END $$;
