-- =============================================================================
-- PIIマスク処理（seedデータのサニタイズ）
-- 本番データの個人情報をダミーデータに置換する
-- =============================================================================
-- 実行後のログイン情報:
--   全ユーザー      user_<連番>@example.com / Pass1234
--   テストユーザー  test@test.test         / Pass1234
-- =============================================================================

-- トリガー無効化
SET session_replication_role = 'replica';

-- -----------------------------------------------------------------------------
-- auth.users: メール・パスワード・メタデータをマスク
-- -----------------------------------------------------------------------------
UPDATE auth.users u SET
  email = 'user_' || n.rn || '@example.com',
  -- 全ユーザーを Pass1234 でログイン可能にする。ローカル限定かつ
  -- ここまでで氏名・メール・誕生日はマスク済みなので実害はない。
  -- 相関のないスカラサブクエリなので gen_salt は 1 回だけ評価される
  -- (直接書くと行数ぶん bcrypt が走る)。
  encrypted_password = (SELECT crypt('Pass1234', gen_salt('bf'))),
  phone = NULL,
  raw_user_meta_data = jsonb_build_object(
    'full_name', 'テストユーザー' || n.rn,
    'avatar_url', ''
  ),
  raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
  confirmation_token = '',
  recovery_token = '',
  email_change_token_new = '',
  email_change_token_current = '',
  reauthentication_token = '',
  email_change = '',
  phone_change = '',
  phone_change_token = ''
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM auth.users
) n
WHERE u.id = n.id;

-- -----------------------------------------------------------------------------
-- public.users: 名前・誕生日・プロフィール・トークンをマスク
-- -----------------------------------------------------------------------------
UPDATE public.users u SET
  name = 'ユーザー' || n.rn,
  birthday = DATE '2000-01-01' + (FLOOR(RANDOM() * 3650))::int,
  bio = NULL,
  profile_image_path = NULL,
  google_calendar_refresh_token = NULL,
  google_calendar_enabled = false
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM public.users
) n
WHERE u.id = n.id;

-- -----------------------------------------------------------------------------
-- auth.identities: identity_data に残る本番のメール・氏名・アバターをマスク
-- -----------------------------------------------------------------------------
-- auth.users.email をマスクしても、OAuth プロバイダから来た identity_data に
-- 同じ情報 (email / full_name / name / avatar_url / picture / birthday / gender)
-- がそのまま残る。
--
-- メールは rn を採番し直さず、上でマスク済みの auth.users.email をそのまま参照する。
-- 採番し直すと created_at が同値のユーザーで順序が揺れて users と identities が
-- 食い違ううえ、再実行するたびにテストユーザーまで巻き込んで番号がずれる。
UPDATE auth.identities i SET
  identity_data = jsonb_build_object(
    'sub', CASE WHEN i.provider = 'email' THEN i.user_id::text ELSE i.provider_id END,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  provider_id = CASE
    WHEN i.provider = 'email' THEN u.email
    ELSE i.provider_id
  END
FROM auth.users u
WHERE i.user_id = u.id;

-- -----------------------------------------------------------------------------
-- テストユーザー追加（test@test.test / Pass1234）
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token,
  email_change_token_new, email_change_token_current,
  email_change, phone_change, phone_change_token, reauthentication_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'authenticated', 'authenticated',
  'test@test.test',
  crypt('Pass1234', gen_salt('bf')),
  now(), now(), now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "テストユーザー"}'::jsonb,
  '', '', '', '',
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'test@test.test',
  'email',
  jsonb_build_object('sub', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'email', 'test@test.test'),
  now(), now(), now()
) ON CONFLICT DO NOTHING;

INSERT INTO public.users (id, name, gender, birthday, created_at, updated_at)
VALUES (
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'テストユーザー', 0, '2000-01-01', now(), now()
) ON CONFLICT (id) DO NOTHING;

-- トリガー再有効化
SET session_replication_role = 'origin';
