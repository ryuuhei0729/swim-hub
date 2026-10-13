-- =============================================================================
-- チーム管理者がメンバーの目標・マイルストーンを閲覧する RPC
-- =============================================================================
-- 背景:
--   goals / milestones の SELECT RLS は本人 (auth.uid() = user_id) のみで、
--   チーム管理者は他人の目標を直接 SELECT できない。RLS は一切変更せず、
--   SECURITY DEFINER RPC を境界にして「チーム管理者が、自チームの承認済み
--   アクティブメンバーの目標を読む」経路だけを開ける。
--
-- 認可 (すべて RAISE EXCEPTION。ランキング RPC と同じ作法):
--   - auth.uid() が NULL
--   - p_team_id / p_member_id が NULL
--   - 呼び出し元が p_team_id の admin (role='admin' AND status='approved'
--     AND is_active IS TRUE) でない
--   - 対象が p_team_id の承認済みかつアクティブなメンバーでない
--   管理者が自分自身を対象にするのは可 (自分もメンバーとして成立するなら返す)。
--
-- 返す列は明示列挙。`g.*` / `to_jsonb(m)` は使わない:
--   goals.reflection_note / milestones.reflection_note / milestones.reflection_done /
--   milestone_achievements は本人だけのものなので、新しい列が goals / milestones に
--   足されても自動では漏れない。
--
-- current_best_time:
--   apps/shared/api/goals.ts の `GoalAPI.getBestTimeForStyle` と同一定義。
--     records.user_id = メンバー AND style_id = 目標の種目 AND
--     pool_type = 目標の大会の水路 AND is_relaying = false の MIN(time)
--   team_id では絞らない (他チームのチーム記録も含める。本人視点と同じ)。
--   time > 0 等の条件も足さない (生の MIN を返し、0 の扱いは
--   apps/shared/utils/goalProgress.ts の computeGoalProgress が決める)。
--   大会 NULL (水路不明) のときは NULL。
--   ⚠️ 片方だけ変えると本人画面と管理者画面の達成率が静かに乖離する。
--   必ず getBestTimeForStyle と同時に直すこと。
--
-- 本 migration は関数定義 (DDL) と REVOKE/GRANT のみ。DML も RLS 変更も無い。
--
-- デプロイ順序: migration 先 → コード後。
--   本番未適用の 20260929000000 / 20260929000001 / 20260929000002 を先に当て、
--   その後に本 migration を当てる (goals.competition_id の nullable 化が前提)。
-- =============================================================================

DROP FUNCTION IF EXISTS "public"."get_team_member_goals"("uuid", "uuid");

CREATE OR REPLACE FUNCTION "public"."get_team_member_goals"(
  "p_team_id"   "uuid",
  "p_member_id" "uuid"
) RETURNS TABLE (
  "id"                    "uuid",
  "style_id"              integer,
  "target_time"           numeric,
  "start_time"            numeric,
  "status"                "text",
  "achieved_at"           timestamp with time zone,
  "created_at"            timestamp with time zone,
  "competition_id"        "uuid",
  "competition_title"     "text",
  "competition_date"      "date",
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
    g.start_time,
    g.status,
    g.achieved_at,
    g.created_at,
    g.competition_id,
    c.title,
    c.date,
    c.pool_type,
    -- getBestTimeForStyle と同一定義 (冒頭コメント参照)。c.pool_type が NULL
    -- (大会 NULL = LEFT JOIN 不成立) なら `r.pool_type = NULL` は常に偽 → MIN は NULL。
    (
      SELECT MIN(r.time)
      FROM public.records r
      WHERE r.user_id = p_member_id
        AND r.style_id = g.style_id
        AND r.pool_type = c.pool_type
        AND r.is_relaying = false
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
