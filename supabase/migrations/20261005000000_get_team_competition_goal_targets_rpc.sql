-- =============================================================================
-- チーム管理者が代理入力画面で、大会内メンバーの「目標タイム」を参照する RPC
-- =============================================================================
-- 背景:
--   goals の SELECT RLS は本人のみ。代理入力 (チーム記録 / チームエントリー) の
--   各行に「目標: xx.xx」を出すため、管理者が自チームの大会について
--   メンバーの目標タイムだけを読める経路を SECURITY DEFINER RPC で開ける。
--   RLS は一切変更しない。
--
-- 認可 (すべて RAISE EXCEPTION):
--   - auth.uid() が NULL / 引数が NULL
--   - 呼び出し元が p_team_id の承認済み・アクティブな管理者でない
--   - p_competition_id が p_team_id の大会でない
--     (存在しない id・個人大会 (team_id IS NULL)・他チームの大会 id はすべて拒否。
--      これが無いと管理者が他チームの大会 id を渡して他チームの目標を読める)
--
-- 返す行: 指定大会の目標 かつ 目標の持ち主が p_team_id の承認済み・アクティブな
--   メンバー。status では絞らない。表示対象 status の定義元は
--   apps/shared/utils/goalTarget.ts の isGoalTargetVisibleStatus (二重定義を避ける)。
-- 返す列は user_id / style_id / target_time / status の4つだけ。
--   milestones・reflection_note・start_time・current_best_time は返さない。
--
-- DDL と REVOKE/GRANT のみ。DML も RLS 変更も無い。
-- デプロイ順序: migration 先 → コード後 (20261004000000 の後)。
-- =============================================================================

DROP FUNCTION IF EXISTS "public"."get_team_competition_goal_targets"("uuid", "uuid");

CREATE OR REPLACE FUNCTION "public"."get_team_competition_goal_targets"(
  "p_team_id"        "uuid",
  "p_competition_id" "uuid"
) RETURNS TABLE (
  "user_id"     "uuid",
  "style_id"    integer,
  "target_time" numeric,
  "status"      "text"
)
    LANGUAGE "plpgsql"
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_caller uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_team_id IS NULL THEN
    RAISE EXCEPTION 'p_team_id is required';
  END IF;

  IF p_competition_id IS NULL THEN
    RAISE EXCEPTION 'p_competition_id is required';
  END IF;

  -- is_active は NULL 許容列なので IS TRUE
  IF NOT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = v_caller
      AND tm.role = 'admin'
      AND tm.status = 'approved'::public.membership_status_type
      AND tm.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'not an approved active admin of the team';
  END IF;

  -- team_id = p_team_id で個人大会 (NULL)・他チーム・不存在をまとめて拒否する
  IF NOT EXISTS (
    SELECT 1
    FROM public.competitions c
    WHERE c.id = p_competition_id
      AND c.team_id = p_team_id
  ) THEN
    RAISE EXCEPTION 'competition does not belong to the team';
  END IF;

  RETURN QUERY
  SELECT g.user_id, g.style_id, g.target_time, g.status
  FROM public.goals g
  WHERE g.competition_id = p_competition_id
    AND EXISTS (
      SELECT 1
      FROM public.team_memberships tm
      WHERE tm.team_id = p_team_id
        AND tm.user_id = g.user_id
        AND tm.status = 'approved'::public.membership_status_type
        AND tm.is_active IS TRUE
    )
  ORDER BY g.user_id, g.style_id;
END;
$$;

REVOKE ALL ON FUNCTION "public"."get_team_competition_goal_targets"("p_team_id" "uuid", "p_competition_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_team_competition_goal_targets"("p_team_id" "uuid", "p_competition_id" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_team_competition_goal_targets"("p_team_id" "uuid", "p_competition_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_team_competition_goal_targets"("p_team_id" "uuid", "p_competition_id" "uuid") TO "service_role";
