-- =============================================================================
-- 大会に「持ち主のいない行」ができないようにし、ユーザー削除で個人の練習・大会を消す
--
-- 変更前: practices / competitions の user_id は ON DELETE SET NULL。
--   退会 API (apps/web/app/api/account/delete) は先に個人の練習・大会を消してからユーザーを消すが、
--   この API を通らない削除 (ダッシュボードや SQL からの auth.users 削除) では個人の練習・大会が
--   user_id = NULL, team_id = NULL のまま残る。誰の RLS にも引っかからず、二度と読めず消せない。
--   本番に大会9件 (ぶら下がる記録・エントリー・目標・出欠・リレー・画像は全て0件) があった。
-- 変更後:
--   - public.users の削除時に、その人の個人の練習・大会 (team_id IS NULL) を先に消すトリガを付ける。
--     ただし他のメンバーのログが付いた練習は消さない。チーム削除 (delete_team_preserving_records) で
--     チーム練習は作成者の個人練習になるので、そのまま消すとメンバーのログが CASCADE で消える。
--     残した練習は FK の SET NULL で持ち主のいない練習になり、ログを付けたメンバーには
--     has_own_practice_log 経由で見え続ける。退会 API は練習を自分では消さず、このトリガに任せる。
--     チームの練習・大会は従来どおり user_id / created_by が NULL になって残る
--     (06_account_team_deletion_scope の V-06)。
--   - competitions: 既存の孤児を削除し、CHECK (user_id IS NOT NULL OR team_id IS NOT NULL) を付ける。
--     チーム大会はチーム削除で大会ごと消える (team_id の FK は CASCADE) ので、この状態は他に生まれない。
--   - practices には CHECK を付けない。delete_team_preserving_records はチーム練習を消さずに
--     team_id だけ外して、他のメンバーのログを残す。作成者が退会済み (user_id NULL) の練習は
--     持ち主のいない練習として残り、ログを付けたメンバーには has_own_practice_log 経由で見える。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ユーザー削除時に個人の練習・大会を消す
--    BEFORE DELETE で消すので、続く FK の SET NULL は個人の行には届かない。
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."delete_personal_events_of_deleted_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET search_path = public
    AS $$
BEGIN
  DELETE FROM public.practices p
  WHERE p.user_id = OLD.id
    AND p.team_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.practice_logs pl
      WHERE pl.practice_id = p.id AND pl.user_id <> OLD.id
    );
  DELETE FROM public.competitions WHERE user_id = OLD.id AND team_id IS NULL;
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION "public"."delete_personal_events_of_deleted_user"() IS
  'users の BEFORE DELETE トリガ。本人の個人の練習・大会 (team_id IS NULL) を消す。他のメンバーのログが付いた練習は残す';

REVOKE ALL ON FUNCTION "public"."delete_personal_events_of_deleted_user"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE TRIGGER "delete_personal_events_of_deleted_user"
  BEFORE DELETE ON "public"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."delete_personal_events_of_deleted_user"();

-- -----------------------------------------------------------------------------
-- 2. 大会の孤児の削除と CHECK
-- -----------------------------------------------------------------------------
DELETE FROM "public"."competitions" WHERE "user_id" IS NULL AND "team_id" IS NULL;

ALTER TABLE "public"."competitions"
  ADD CONSTRAINT "competitions_owner_check" CHECK ("user_id" IS NOT NULL OR "team_id" IS NOT NULL);
