-- =============================================================================
-- Google カレンダーのリフレッシュトークン (暗号化済み) を users から専用テーブルへ移す
--
-- 変更前: users.google_calendar_refresh_token。users の SELECT ポリシーはチームメイトの行も
--   見せる (shares_active_team) ので、RLS が行単位である以上、チームメイトにもこの列が読めた。
--   値はアプリ側で暗号化済みだが、秘密の値をチーム全員に配る形になっていた。
-- 変更後: public.user_secrets に置く。RLS を有効にしてポリシーを1つも作らないので、
--   authenticated / anon からは読めない。読み書きは既存の SECURITY DEFINER 関数
--   get_google_refresh_token / set_google_refresh_token (本人 or service_role のみ) だけが行う。
--   関数のシグネチャと戻り値は変えないので、アプリ側の呼び出しは変わらない。
-- =============================================================================

CREATE TABLE IF NOT EXISTS "public"."user_secrets" (
    "user_id" "uuid" NOT NULL,
    "google_calendar_refresh_token" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_secrets_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_secrets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE
);

COMMENT ON TABLE "public"."user_secrets" IS
  'ユーザーごとの秘密の値。ポリシーを持たないので API ロールからは読めない。get/set_google_refresh_token 経由でのみ読み書きする';

ALTER TABLE "public"."user_secrets" ENABLE ROW LEVEL SECURITY;

-- ポリシーを作らないので authenticated / anon には権限を渡さない。service_role だけに付ける。
REVOKE ALL ON TABLE "public"."user_secrets" FROM "anon", "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."user_secrets" TO "service_role";

CREATE OR REPLACE TRIGGER "update_user_secrets_updated_at"
  BEFORE UPDATE ON "public"."user_secrets"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- 保護者アカウントの書き込み禁止 (20261129000000 で public の全テーブルに付けたもの) を新テーブルにも付ける
CREATE OR REPLACE TRIGGER "guardian_read_only_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "public"."user_secrets"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."guardian_read_only_guard"();

-- 既存のトークンを移す
INSERT INTO "public"."user_secrets" ("user_id", "google_calendar_refresh_token")
SELECT "id", "google_calendar_refresh_token"
FROM "public"."users"
WHERE "google_calendar_refresh_token" IS NOT NULL
ON CONFLICT ("user_id") DO UPDATE SET "google_calendar_refresh_token" = EXCLUDED."google_calendar_refresh_token";

-- -----------------------------------------------------------------------------
-- 関数を新テーブルに向ける (認可の判定は 20260209000000 のまま)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."set_google_refresh_token"("p_user_id" "uuid", "p_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
    DELETE FROM public.user_secrets WHERE user_id = p_user_id;
    UPDATE public.users
    SET google_calendar_enabled = false,
        updated_at = NOW()
    WHERE id = p_user_id;
    RETURN;
  END IF;

  -- 暗号化済みトークンを保存（暗号化はアプリ側で実施済み）
  INSERT INTO public.user_secrets (user_id, google_calendar_refresh_token)
  VALUES (p_user_id, p_token)
  ON CONFLICT (user_id) DO UPDATE SET google_calendar_refresh_token = EXCLUDED.google_calendar_refresh_token;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_google_refresh_token"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
  FROM public.user_secrets
  WHERE user_id = p_user_id;

  RETURN v_token;
END;
$$;

ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "google_calendar_refresh_token";
