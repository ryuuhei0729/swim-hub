-- チームRLSポリシーの修正: 承認待ちのメンバーもチーム情報を閲覧可能にする
--
-- 問題:
--   チーム参加申請時(status='pending')、is_team_member関数はis_active=trueのみをチェックするため、
--   承認待ちユーザーはチームデータを取得できず、UIでエラーが発生する
--
-- 解決策:
--   SECURITY DEFINER関数を作成してRLS再帰を回避し、pendingステータスのメンバーシップも許可する

-- 承認待ちメンバーかどうかを判定するSECURITY DEFINER関数を作成（RLS回避用）
CREATE OR REPLACE FUNCTION "public"."is_pending_team_member"("target_team_id" "uuid", "target_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql"
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.team_id = target_team_id
      AND tm.user_id = target_user_id
      AND tm.status = 'pending'
  );
$$;

COMMENT ON FUNCTION "public"."is_pending_team_member"("target_team_id" "uuid", "target_user_id" "uuid") IS '指定したユーザーがチームへの参加申請中かを判定する（RLS回避用）';

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "teams_select_members" ON "public"."teams";

-- 新しいポリシーを作成: アクティブメンバー + 承認待ちメンバー + 作成者がアクセス可能
CREATE POLICY "teams_select_members" ON "public"."teams"
FOR SELECT USING (
  -- チームの作成者
  ("created_by" = (SELECT "auth"."uid"()))
  OR
  -- アクティブなチームメンバー
  public.is_team_member("teams"."id", (SELECT "auth"."uid"()))
  OR
  -- 承認待ちのメンバー（チーム参加申請中のユーザー）
  public.is_pending_team_member("teams"."id", (SELECT "auth"."uid"()))
);

COMMENT ON POLICY "teams_select_members" ON "public"."teams" IS
  'チームメンバー（承認待ち含む）と作成者がチーム情報を閲覧可能';
