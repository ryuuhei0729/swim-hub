-- =============================================================================
-- チーム管理者向け: メンバーのフォーカスポイントを読み取り専用で取得する RPC
-- =============================================================================
-- チームタブの「目標」(管理者ビュー) で、選んだメンバーの大会目標・マイルストーンと並べて
-- フォーカスポイントも見られるようにする。
--
-- focus_points の RLS は本人の行だけなので、管理者が直接 SELECT しても 0 件になる。
-- get_team_member_goals (20261004000000 / 20261024000000) と同じく SECURITY DEFINER の RPC にし、
-- 認可を関数の中で行う:
--   - 呼び出し元: そのチームの承認済み・アクティブな管理者
--   - 対象: 同じチームの承認済み・アクティブなメンバー
-- 返す列は表示に要るものだけ (user_id などは返さない)。書き込みはしない。
--
-- 冪等性: DROP FUNCTION IF EXISTS / CREATE OR REPLACE / REVOKE / GRANT のみ。
-- =============================================================================

DROP FUNCTION IF EXISTS "public"."get_team_member_focus_points"("uuid", "uuid");

CREATE OR REPLACE FUNCTION "public"."get_team_member_focus_points"(
  "p_team_id"   "uuid",
  "p_member_id" "uuid"
) RETURNS TABLE (
  "id"          "uuid",
  "title"       "text",
  "note"        "text",
  "status"      "text",
  "mastered_at" timestamp with time zone,
  "created_at"  timestamp with time zone
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

  -- 並びは本人の画面と同じ: 取り組み中は追加した順、身についたものは新しく身についた順
  RETURN QUERY
  SELECT fp.id, fp.title, fp.note, fp.status, fp.mastered_at, fp.created_at
  FROM public.focus_points fp
  WHERE fp.user_id = p_member_id
  ORDER BY
    (fp.status = 'mastered'),
    CASE WHEN fp.status = 'active' THEN fp.created_at END ASC,
    fp.mastered_at DESC NULLS LAST,
    fp.id;
END;
$$;

REVOKE ALL ON FUNCTION "public"."get_team_member_focus_points"("p_team_id" "uuid", "p_member_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_team_member_focus_points"("p_team_id" "uuid", "p_member_id" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_team_member_focus_points"("p_team_id" "uuid", "p_member_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_team_member_focus_points"("p_team_id" "uuid", "p_member_id" "uuid") TO "service_role";
