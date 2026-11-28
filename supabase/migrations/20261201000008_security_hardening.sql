-- =============================================================================
-- Supabase advisor (本番、2026-11-28) の指摘への対応
--
-- 1. auth_rls_initplan: practice_log_templates のポリシーが auth.uid() を行ごとに評価していた。
--    他のテーブル (20260129000000_optimize_rls_policies) と同じく (SELECT auth.uid()) にする。
-- 2. function_search_path_mutable: updated_at を更新するトリガ関数2つに search_path を固定する。
-- 3. anon_security_definer_function_executable: 本人確認が前提の SECURITY DEFINER 関数を
--    未ログインでも呼べた。関数の中で auth.uid() を確かめているので悪用はできないが、
--    多層防御として PUBLIC / anon の実行権限を外す。
--    is_team_member など RLS ポリシーの中で使う判定関数は外さない。anon が SELECT できる
--    competitions のポリシーから呼ばれており、外すと anon の SELECT がエラーになる。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. practice_log_templates のポリシー
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own templates" ON "public"."practice_log_templates";
CREATE POLICY "Users can manage own templates" ON "public"."practice_log_templates"
  USING (( SELECT "auth"."uid"() AS "uid") = "user_id")
  WITH CHECK (( SELECT "auth"."uid"() AS "uid") = "user_id");

-- -----------------------------------------------------------------------------
-- 2. search_path
-- -----------------------------------------------------------------------------
ALTER FUNCTION "public"."update_updated_at_column"() SET search_path = public;
ALTER FUNCTION "public"."update_user_subscriptions_updated_at"() SET search_path = public;

-- -----------------------------------------------------------------------------
-- 3. 実行権限
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION "public"."get_google_refresh_token"("uuid") FROM PUBLIC, "anon";
REVOKE EXECUTE ON FUNCTION "public"."set_google_refresh_token"("uuid", "text") FROM PUBLIC, "anon";
REVOKE EXECUTE ON FUNCTION "public"."get_invite_code_by_team_id"("uuid") FROM PUBLIC, "anon";
REVOKE EXECUTE ON FUNCTION "public"."increment_template_use_count"("uuid") FROM PUBLIC, "anon";
REVOKE EXECUTE ON FUNCTION "public"."find_team_by_invite_code"("text") FROM PUBLIC, "anon";
-- auth.users の INSERT トリガ専用。トリガの実行に EXECUTE 権限は要らないので、API からは誰も呼べなくする
REVOKE EXECUTE ON FUNCTION "public"."handle_new_user"() FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_google_refresh_token"("uuid") TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."set_google_refresh_token"("uuid", "text") TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."get_invite_code_by_team_id"("uuid") TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."increment_template_use_count"("uuid") TO "authenticated", "service_role";
GRANT EXECUTE ON FUNCTION "public"."find_team_by_invite_code"("text") TO "authenticated", "service_role";
