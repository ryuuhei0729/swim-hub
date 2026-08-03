-- =============================================================================
-- セキュリティ監査 Critical: C-1 + C-6 (increment_daily_usage の権限昇格穴)
-- =============================================================================
--
-- 背景 (20260411000000 時点の残存穴):
--   - increment_daily_usage は SECURITY DEFINER だが SET search_path が
--     付与されておらず、他の SECURITY DEFINER 関数 (is_team_admin,
--     request_join_team 等) と異なり search_path 経由のなりすまし攻撃に脆弱
--     だった (C-6)。
--   - 呼び出し元 (edge function scan-timesheet, scanner incrementScanCount) は
--     いずれも anon key + ユーザー JWT のクライアントで RPC を呼ぶが、
--     p_user_id はクライアントから渡された値をそのまま使っており、
--     auth.uid() との一致チェックが無かった。RLS の daily_usage_insert/
--     daily_usage_update ポリシー (WITH CHECK (auth.uid() = user_id)) は
--     RPC の SECURITY DEFINER 実行下では評価されない (関数所有者=postgres
--     で実行されるため RLS が適用されない) ため、事実上 p_user_id に他人の
--     UUID を渡すだけで他人の app_daily_usage 行を操作できてしまう (C-1)。
--   - ON CONFLICT DO UPDATE が usage_count のみ更新しており、実際の無料枠
--     判定に使われる daily_tokens_used が更新されないまま放置されていた
--     (無料枠が実質無制限になるバグ)。
--
-- 対策方針 (既存の正解パターンを踏襲):
--   1. SET search_path = public を追加 (is_team_admin 等の既存 SECURITY
--      DEFINER 関数と同型)。
--   2. 関数冒頭で auth.uid() = p_user_id を検証し、不一致なら例外を投げる
--      (20260706000000 の request_join_team/reactivate_own_membership と
--      同じ「関数内で認可ガードを実施する」パターン)。
--   3. ON CONFLICT DO UPDATE に daily_tokens_used の加算を追加する。
--   4. REVOKE ALL FROM PUBLIC, anon / GRANT EXECUTE TO authenticated,
--      service_role を付与する (20260706000000:187-190 と同型)。
--   5. app_daily_usage の daily_usage_insert / daily_usage_update ポリシーを
--      DROP し、直接の INSERT/UPDATE を封じ、この RPC 経由に一本化する
--      (20260411000000:7-8 の「ポリシーを DROP して専有経路にする」前例と
--      同型)。daily_usage_select は変更しない。
--   6. ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public から
--      FUNCTIONS への anon デフォルト付与を REVOKE し、今後作成される
--      新規関数への自動 anon EXECUTE 付与を防止する (initial_schema.sql:2245
--      の root cause 是正。20260705000001 のテーブル版と同型)。
--
-- 影響確認 (正規フローが壊れない根拠):
--   - scan-timesheet edge function / scanner incrementScanCount は、いずれも
--     anon key + ユーザー JWT クライアントで auth.uid() が自分自身の uid と
--     一致する呼び出ししか行わない (QA Phase A 実測済み)。したがって
--     auth.uid() = p_user_id の検証追加は正規フローに影響しない。
--   - service_role 経由の呼び出しは無い (同上実測)。将来 service_role から
--     呼ぶ場合は auth.uid() が NULL になり検証に失敗するため、その際は
--     別途 service_role 専用の代替手段を検討すること。
--
-- 冪等性: CREATE OR REPLACE / DROP POLICY IF EXISTS / REVOKE (未付与でもエラー
-- にならない) のみで構成しており、本番の既存データには影響しない。
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."increment_daily_usage"(
  "p_user_id" "uuid",
  "p_app" "app_id",
  "p_usage_date" "date",
  "p_last_used_at" timestamptz
)
RETURNS "void"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'permission denied: p_user_id does not match the authenticated user';
  END IF;

  INSERT INTO public.app_daily_usage (user_id, app, usage_date, usage_count, daily_tokens_used, last_used_at)
  VALUES (p_user_id, p_app, p_usage_date, 1, 1, p_last_used_at)
  ON CONFLICT (user_id, app, usage_date)
  DO UPDATE SET
    usage_count = app_daily_usage.usage_count + 1,
    daily_tokens_used = app_daily_usage.daily_tokens_used + 1,
    last_used_at = p_last_used_at;
END;
$$;

ALTER FUNCTION "public"."increment_daily_usage"("uuid", "app_id", "date", timestamptz) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."increment_daily_usage"("uuid", "app_id", "date", timestamptz) IS
  '呼び出し元自身 (auth.uid() = p_user_id) の app_daily_usage を usage_count/daily_tokens_used ともに
+1 する。SECURITY DEFINER のため RLS をすり抜けるが、関数内で auth.uid() との一致を検証することで
他人の p_user_id を渡すなりすまし攻撃 (C-1) を防止する。app_daily_usage への直接 INSERT/UPDATE は
daily_usage_insert/daily_usage_update ポリシー DROP により禁止されており、加算はこの関数経由に一本化される。';

REVOKE ALL ON FUNCTION "public"."increment_daily_usage"("uuid", "app_id", "date", timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."increment_daily_usage"("uuid", "app_id", "date", timestamptz) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."increment_daily_usage"("uuid", "app_id", "date", timestamptz) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."increment_daily_usage"("uuid", "app_id", "date", timestamptz) TO "service_role";

-- -----------------------------------------------------------------------------
-- app_daily_usage: 直接 INSERT/UPDATE を封じ、increment_daily_usage RPC 経由に一本化
-- daily_usage_select は変更しない。
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "daily_usage_insert" ON "public"."app_daily_usage";
DROP POLICY IF EXISTS "daily_usage_update" ON "public"."app_daily_usage";

-- daily_usage_insert の DROP だけで直接 INSERT は WITH CHECK 相当が false になり
-- 例外 (42501: new row violates row-level security policy) で拒否される。
-- 一方 UPDATE は USING 句相当が false になるだけで対象行が 0 件になり、例外を投げず
-- 静かに 0 行更新で終わってしまう (PostgreSQL の RLS の仕様上、UPDATE/DELETE は
-- ポリシー無し=対象行 0件、INSERT はポリシー無し=新規行が必ず違反、という非対称性がある)。
-- 「daily_tokens_used を 0 にリセットする」ような攻撃を明確に拒否 (例外) させるため、
-- テーブル権限層でも authenticated から UPDATE を剥奪し、RLS 到達前に
-- permission denied for table (42501) で弾く。RPC は SECURITY DEFINER (関数所有者
-- postgres として実行) のため、この REVOKE の影響を受けず従来どおり動作する。
REVOKE UPDATE ON TABLE "public"."app_daily_usage" FROM "authenticated";

-- -----------------------------------------------------------------------------
-- DEFAULT PRIVILEGES の是正 (root cause: 新規関数への自動 anon GRANT 防止)
--   initial_schema.sql:2245 の
--     ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
--     GRANT ALL ON FUNCTIONS TO "anon";
--   により、今後 postgres ロールが作成する新規関数にも自動で anon EXECUTE が
--   付与されてしまう。20260705000001 のテーブル版と同型の是正を関数にも適用する。
-- -----------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  REVOKE ALL ON FUNCTIONS FROM "anon";
