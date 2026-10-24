-- =============================================================================
-- get_team_member_goals の戻り値に大会終了日 (competition_end_date) を足す
-- =============================================================================
-- 管理者のメンバー目標画面は、本人の目標画面と同じく「大会が終わった目標」を出さない。
-- 複数日開催の大会は終了日で判定する (開催中の2日目以降も出す) ため、終了日が要る。
-- 戻り列が変わるので CREATE OR REPLACE ではなく DROP → CREATE。
-- 元の定義: 20261013000000 の migration (認可・明示列挙・current_best_time の
-- 定義は同じ。変更は competition_end_date の追加のみ)。
--
-- デプロイ順序: どちらが先でもよい。旧コードは追加列を読まず、新コードは
-- competition_end_date が無ければ competition_date で判定する。
-- =============================================================================

DROP FUNCTION "public"."get_team_member_goals"("uuid", "uuid");

CREATE FUNCTION "public"."get_team_member_goals"(
  "p_team_id"   "uuid",
  "p_member_id" "uuid"
) RETURNS TABLE (
  "id"                    "uuid",
  "style_id"              integer,
  "target_time"           numeric,
  "status"                "text",
  "achieved_at"           timestamp with time zone,
  "created_at"            timestamp with time zone,
  "competition_id"        "uuid",
  "competition_title"     "text",
  "competition_date"      "date",
  "competition_end_date"  "date",
  "competition_pool_type" integer,
  "current_best_time"     numeric,
  "milestones"            "jsonb"
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

  IF p_member_id IS NULL THEN
    RAISE EXCEPTION 'p_member_id is required';
  END IF;

  -- 呼び出し元: 承認済み・アクティブな管理者。is_active は NULL 許容列なので IS TRUE。
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

  -- 対象: 同じチームの承認済み・アクティブなメンバー
  IF NOT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = p_member_id
      AND tm.status = 'approved'::public.membership_status_type
      AND tm.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'target is not an approved active member of the team';
  END IF;

  RETURN QUERY
  SELECT
    g.id,
    g.style_id,
    g.target_time,
    g.status,
    g.achieved_at,
    g.created_at,
    g.competition_id,
    c.title,
    c.date,
    c.end_date,
    c.pool_type,
    -- getBestTimeForStyle と同一定義 (20261013000000 の冒頭コメント参照)。c.pool_type が NULL
    -- (大会 NULL = LEFT JOIN 不成立) なら `r.pool_type = NULL` は常に偽 → MIN は NULL。
    (
      SELECT MIN(r.time)
      FROM public.records r
      WHERE r.user_id = p_member_id
        AND r.style_id = g.style_id
        AND r.pool_type = c.pool_type
        AND r.is_relaying = false
        AND r.time > 0
    ),
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'title', m.title,
            'type', m.type,
            'params', m.params,
            'deadline', m.deadline,
            'status', m.status,
            'achieved_at', m.achieved_at
          )
          -- 本人画面 GoalAPI.getMilestones と同じ created_at DESC (id は同時刻の安定化)
          ORDER BY m.created_at DESC, m.id
        )
        FROM public.milestones m
        WHERE m.goal_id = g.id
      ),
      '[]'::jsonb
    )
  FROM public.goals g
  LEFT JOIN public.competitions c ON c.id = g.competition_id
  WHERE g.user_id = p_member_id
  ORDER BY g.created_at, g.id;
END;
$$;

REVOKE ALL ON FUNCTION "public"."get_team_member_goals"("p_team_id" "uuid", "p_member_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_team_member_goals"("p_team_id" "uuid", "p_member_id" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_team_member_goals"("p_team_id" "uuid", "p_member_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_team_member_goals"("p_team_id" "uuid", "p_member_id" "uuid") TO "service_role";
