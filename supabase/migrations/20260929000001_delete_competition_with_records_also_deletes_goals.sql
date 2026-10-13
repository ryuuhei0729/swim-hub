-- =============================================================================
-- delete_competition_with_records RPC 改修: 個人大会削除時に紐づく goals も削除
-- =============================================================================
--
-- 背景 (PM 裁定 P1):
--   既存方針「個人大会の削除は記録も消す / チーム大会の削除は記録を残す」に
--   goals を揃える。個人大会分岐で records と同様に competition_id が一致する
--   goals を削除する。milestones / milestone_achievements は goals への
--   ON DELETE CASCADE (20260115020000) により自動的に削除される。
--
--   チーム大会は本 RPC の対象外 (下記ガードで拒否) のため、goals の扱いを
--   変える必要はない。チーム大会・チーム自体の削除 (別経路) では goals は
--   削除されず、FK の ON DELETE SET NULL (20260929000000) により
--   competition_id が自動的に NULL 化される
--   (「大会情報なし」表示は Web Developer 実装の UI 側ガードで対応)。
--
-- v1.1 修正 (F-C1): v1.0 では比較元を誤って 20260826000000 (チーム大会削除
--   ガード追加前の版) に取り、"チーム大会は本 RPC の対象外" ガードを消した
--   まま goals 削除を追加してしまっていた。本関数の最新定義は
--   20260919000000_team_delete_admin_only.sql であり、そこで追加された
--   「team_id IS NOT NULL は admin であっても本 RPC 経由の削除を拒否する」
--   ガードを含む関数本体を逐語ベースにし、個人大会分岐 (ガード通過後の
--   処理) に goals 削除を足す差分のみを加える。ガード自体・その前後の
--   分岐構造はリファクタしない。
--
-- 実装規約: 20260919000000 時点の SECURITY DEFINER / search_path /
-- 認可ガード (IS DISTINCT FROM 含む) / チーム大会拒否ガード /
-- REVOKE-GRANT 構成は変更しない。本 migration は関数本体のみ
-- CREATE OR REPLACE し、goals 削除の追加のみを差分として加える。
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."delete_competition_with_records"(
  "p_competition_id" "uuid"
) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_caller uuid;
  v_competition_owner uuid;
  v_competition_team_id uuid;
  v_deleted_record_count integer := 0;
  v_deleted_goal_count integer := 0;
BEGIN
  -- 未認証は拒否
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'authentication required'
    );
  END IF;

  -- 対象 competition を引く
  SELECT c.user_id, c.team_id
    INTO v_competition_owner, v_competition_team_id
    FROM public.competitions c
   WHERE c.id = p_competition_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'competition not found'
    );
  END IF;

  -- 作成者本人のみ削除可能。
  -- competitions.user_id は NULLABLE (NOT NULL 制約なし) かつ INSERT RLS
  -- (20260801000001) の team_admin 分岐は user_id を拘束しないため、
  -- user_id IS NULL の大会が実在しうる。`<>` は NULL に対して NULL を返し
  -- plpgsql の IF ではそれが偽として扱われるため、素朴な `<>` 比較だと
  -- user_id IS NULL の大会を任意のログインユーザーが削除できてしまう
  -- (fail open)。NULL を通常の値として比較する IS DISTINCT FROM を使う。
  IF v_competition_owner IS DISTINCT FROM v_caller THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'not authorized'
    );
  END IF;

  -- チーム大会は本 RPC の対象外。admin であっても拒否する
  -- (チーム大会削除はチーム管理画面の別経路に限定するため)。
  IF v_competition_team_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'team competition cannot be deleted via this function'
    );
  END IF;

  -- 個人大会: 紐づく records と goals を先に削除する
  -- (records_competition_id_fkey / goals_competition_id_fkey は
  --  ON DELETE SET NULL のため、competitions を先に削除しても自然には消えない)
  DELETE FROM public.records WHERE competition_id = p_competition_id;
  GET DIAGNOSTICS v_deleted_record_count = ROW_COUNT;

  DELETE FROM public.goals WHERE competition_id = p_competition_id;
  GET DIAGNOSTICS v_deleted_goal_count = ROW_COUNT;

  DELETE FROM public.competitions WHERE id = p_competition_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_record_count', v_deleted_record_count,
    'deleted_goal_count', v_deleted_goal_count
  );
END;
$$;

ALTER FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") IS '個人大会 (team_id IS NULL) を削除する。紐づく records と goals も削除し、削除件数を返す。チーム大会 (team_id IS NOT NULL) は admin であっても拒否する。SECURITY DEFINER のため RLS をすり抜けるが、関数内で作成者本人 (auth.uid() = competitions.user_id) のみに削除を許可する。anon は実行不可。';

REVOKE ALL ON FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") TO "service_role";
