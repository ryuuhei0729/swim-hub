-- Google Calendar トークン関数をサービスロール対応に修正
-- Supabase Vault を使用して暗号化保存

-- Vault 拡張を有効化（既に有効な場合はスキップ）
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- サービスロール対応版: set_google_refresh_token（Vault使用）
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
  v_is_service_role boolean;
  v_secret_name text;
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

  v_secret_name := 'google_refresh_token_' || p_user_id::text;

  -- NULLの場合は削除
  IF p_token IS NULL THEN
    DELETE FROM vault.secrets WHERE name = v_secret_name;
    UPDATE public.users
    SET google_calendar_refresh_token = NULL,
        updated_at = NOW()
    WHERE id = p_user_id;
    RETURN;
  END IF;

  -- Vaultに保存（既存があれば更新）
  INSERT INTO vault.secrets (name, secret)
  VALUES (v_secret_name, p_token)
  ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret;

  -- users テーブルにはVault参照を記録
  UPDATE public.users
  SET google_calendar_refresh_token = 'vault:' || p_user_id::text,
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

-- サービスロール対応版: get_google_refresh_token（Vault使用）
CREATE OR REPLACE FUNCTION public.get_google_refresh_token(
  p_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_service_role boolean;
  v_secret_name text;
  v_token text;
  v_stored_value text;
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

  -- users テーブルから値を取得
  SELECT google_calendar_refresh_token INTO v_stored_value
  FROM public.users
  WHERE id = p_user_id;

  IF v_stored_value IS NULL THEN
    RETURN NULL;
  END IF;

  -- Vault参照の場合はVaultから取得
  IF v_stored_value LIKE 'vault:%' THEN
    v_secret_name := 'google_refresh_token_' || p_user_id::text;
    SELECT decrypted_secret INTO v_token
    FROM vault.decrypted_secrets
    WHERE name = v_secret_name;
    RETURN v_token;
  END IF;

  -- 旧形式（直接保存）の場合はそのまま返す（後方互換性）
  RETURN v_stored_value;
END;
$$;
