-- =============================================================================
-- 大会削除 RPC: delete_competition_with_records
-- =============================================================================
-- 背景:
--   deleteCompetition() は competitions.user_id = auth.uid() で絞った DELETE のみ
--   行っており、records は削除されない (FK ON DELETE SET NULL で competition_id
--   が NULL 化されるだけ)。「大会を削除したら紐づく records も消えてほしい」という
--   要望に対応する。
--
--   ただし records.user_id が「大会作成者」と「記録の実施者」で一致しない場合がある
--   (チーム大会は team_id を持ち、team_id NOT NULL のとき records は他メンバーの
--   ものを含む)。TeamCompetitions.tsx がチーム大会作成時に user_id = 作成者 /
--   team_id = チームID で INSERT するため、deleteCompetition の
--   `.eq("user_id", user.id)` は「個人大会」だけでなく「自分が作成したチーム大会」
--   にもマッチしてしまう。素朴に records 削除を追加すると、チーム大会削除時に
--   他メンバーの records まで一括削除する Critical を作ってしまう。
--
--   よって本 RPC は team_id で分岐する:
--     - team_id IS NULL (個人大会): 紐づく records を削除する。
--     - team_id IS NOT NULL (チーム大会): records は削除しない (現行挙動を維持)。
--       チーム大会自体の削除を拒否するわけではない (拒否すると「自分が作成した
--       チーム大会を削除できない」退行になる)。
--
-- 実装規約:
--   既存 RPC replace_practice_logs (20260618000000) に倣う:
--   SECURITY DEFINER + SET search_path = public + 関数冒頭の認可ガード +
--   jsonb 返却 + REVOKE ALL FROM PUBLIC, anon + GRANT EXECUTE TO authenticated,
--   service_role。
--
--   EXCEPTION WHEN OTHERS で握りつぶさない: DML 失敗時は例外を呼び出し元まで
--   伝播させる (success:false に化けて握り潰されるのを避けるため)。認可・入力
--   チェックのみ jsonb の success:false で返す。
--
--   本 migration は関数定義 (DDL) と REVOKE/GRANT のみ。データを削除する DML
--   文はここには書かない (関数本体の中にのみ存在する)。
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

  IF v_competition_team_id IS NULL THEN
    -- 個人大会: 紐づく records を先に削除する
    -- (records_competition_id_fkey は ON DELETE SET NULL のため、
    --  competitions を先に削除しても records は自然には消えない)
    DELETE FROM public.records WHERE competition_id = p_competition_id;
    GET DIAGNOSTICS v_deleted_record_count = ROW_COUNT;
  END IF;
  -- チーム大会 (team_id IS NOT NULL): records は削除しない (現行挙動を維持)。
  -- v_deleted_record_count は初期値 0 のまま。

  DELETE FROM public.competitions WHERE id = p_competition_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_record_count', v_deleted_record_count
  );
END;
$$;

ALTER FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") IS '大会を削除する。個人大会 (team_id IS NULL) の場合は紐づく records も削除し、削除件数を返す。チーム大会 (team_id IS NOT NULL) は records を削除せず大会のみ削除する。SECURITY DEFINER のため RLS をすり抜けるが、関数内で作成者本人 (auth.uid() = competitions.user_id) のみに削除を許可する。anon は実行不可。';

-- ===========================================================================
-- 権限の再設定: anon への GRANT を剥奪し、authenticated には EXECUTE のみ付与。
-- service_role は従来どおり (サーバー側の信頼済み呼び出し用)。
-- ===========================================================================
REVOKE ALL ON FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") TO "service_role";
