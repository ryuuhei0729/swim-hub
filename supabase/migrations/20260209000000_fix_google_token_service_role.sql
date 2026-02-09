-- Google Calendar トークン関数をサービスロール対応に修正
-- 暗号化はアプリケーションレベルで実施（Web API側）

-- サービスロール対応版: set_google_refresh_token
-- 暗号化済みトークンを受け取って保存
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
  v_user_exists boolean;
BEGIN
  -- サービスロールかどうかをチェック（NULLの場合はfalseにフォールバック）
  v_is_service_role := COALESCE((SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role', false);

  -- サービスロールでない場合は認証チェック
  IF NOT v_is_service_role THEN
    IF (SELECT auth.uid()) IS NULL THEN
      RAISE EXCEPTION '認証が必要です';
    END IF;
    IF (SELECT auth.uid()) != p_user_id THEN
      RAISE EXCEPTION '自分のトークンのみ更新可能です';
    END IF;
  END IF;

  -- ユーザー存在チェック
  SELECT EXISTS(SELECT 1 FROM public.users WHERE id = p_user_id) INTO v_user_exists;
  IF NOT v_user_exists THEN
    RAISE EXCEPTION '指定されたユーザーが存在しません: %', p_user_id;
  END IF;

  -- NULLの場合は連携解除（トークン削除 + フラグOFF）
  IF p_token IS NULL THEN
    UPDATE public.users
    SET google_calendar_refresh_token = NULL,
        google_calendar_enabled = false,
        updated_at = NOW()
    WHERE id = p_user_id;
    RETURN;
  END IF;

  -- 暗号化済みトークンを保存（暗号化はアプリ側で実施済み）
  UPDATE public.users
  SET google_calendar_refresh_token = p_token,
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

-- サービスロール対応版: get_google_refresh_token
-- 暗号化されたトークンをそのまま返す（復号化はアプリ側で実施）
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
  v_token text;
BEGIN
  -- サービスロールかどうかをチェック（NULLの場合はfalseにフォールバック）
  v_is_service_role := COALESCE((SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role', false);

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
  SELECT google_calendar_refresh_token INTO v_token
  FROM public.users
  WHERE id = p_user_id;

  RETURN v_token;
END;
$$;
