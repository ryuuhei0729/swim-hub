-- ================================================
-- 本番環境用: Google Calendar トークン関数の更新
-- pgsodium暗号化 + サービスロール対応
--
-- 実行方法: Supabase Dashboard > SQL Editor で実行
--
-- 注意: Supabase Cloudではpostgresロールは既にpgsodium権限を
-- 持っているため、GRANT文は不要です。
-- ローカル環境で実行する場合は、先にdb resetを実行してから
-- このスクリプトを実行してください。
-- ================================================

-- サービスロール対応版: set_google_refresh_token
CREATE OR REPLACE FUNCTION public.set_google_refresh_token(
  p_user_id uuid,
  p_token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key_id uuid;
  v_encrypted_token bytea;
  v_nonce bytea;
  v_is_service_role boolean;
BEGIN
  -- サービスロールかどうかをチェック
  v_is_service_role := (SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role';

  -- サービスロールでない場合は認証チェック
  IF NOT v_is_service_role THEN
    IF (SELECT auth.uid()) IS NULL THEN
      RAISE EXCEPTION '認証が必要です';
    END IF;
    IF (SELECT auth.uid()) != p_user_id THEN
      RAISE EXCEPTION '自分のトークンのみ更新可能です';
    END IF;
  END IF;

  -- キーIDを取得
  SELECT id INTO v_key_id
  FROM pgsodium.key
  WHERE name = 'google_token_encryption_key'
  LIMIT 1;

  IF v_key_id IS NULL THEN
    RAISE EXCEPTION '暗号化キーが見つかりません';
  END IF;

  -- トークンがNULLの場合はNULLを保存
  IF p_token IS NULL THEN
    UPDATE public.users
    SET google_calendar_refresh_token = NULL,
        updated_at = NOW()
    WHERE id = p_user_id;
    RETURN;
  END IF;

  -- nonceを生成
  v_nonce := pgsodium.crypto_secretbox_noncegen();

  -- トークンを暗号化
  v_encrypted_token := pgsodium.crypto_secretbox(
    p_token::bytea,
    v_nonce,
    v_key_id
  );

  -- nonceと暗号化されたトークンを結合して保存
  UPDATE public.users
  SET google_calendar_refresh_token = v_nonce || v_encrypted_token,
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

-- サービスロール対応版: get_google_refresh_token
CREATE OR REPLACE FUNCTION public.get_google_refresh_token(
  p_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key_id uuid;
  v_encrypted_data bytea;
  v_nonce bytea;
  v_encrypted_token bytea;
  v_decrypted_token text;
  v_is_service_role boolean;
BEGIN
  -- サービスロールかどうかをチェック
  v_is_service_role := (SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role';

  -- サービスロールでない場合は認証チェック
  IF NOT v_is_service_role THEN
    IF (SELECT auth.uid()) IS NULL THEN
      RAISE EXCEPTION '認証が必要です';
    END IF;
    IF (SELECT auth.uid()) != p_user_id THEN
      RAISE EXCEPTION '自分のトークンのみ取得可能です';
    END IF;
  END IF;

  -- 暗号化されたトークンを取得
  SELECT google_calendar_refresh_token INTO v_encrypted_data
  FROM public.users
  WHERE id = p_user_id;

  IF v_encrypted_data IS NULL THEN
    RETURN NULL;
  END IF;

  -- キーIDを取得
  SELECT id INTO v_key_id
  FROM pgsodium.key
  WHERE name = 'google_token_encryption_key'
  LIMIT 1;

  IF v_key_id IS NULL THEN
    RAISE EXCEPTION '暗号化キーが見つかりません';
  END IF;

  -- nonce（先頭24バイト）と暗号化されたトークンを分離
  v_nonce := substring(v_encrypted_data FROM 1 FOR 24);
  v_encrypted_token := substring(v_encrypted_data FROM 25);

  -- トークンを復号化
  v_decrypted_token := convert_from(
    pgsodium.crypto_secretbox_open(
      v_encrypted_token,
      v_nonce,
      v_key_id
    ),
    'UTF8'
  );

  RETURN v_decrypted_token;
END;
$$;
