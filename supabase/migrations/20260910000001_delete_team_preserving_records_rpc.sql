-- =============================================================================
-- チーム削除 RPC: delete_team_preserving_records
-- =============================================================================
-- 背景:
--   records_team_id_fkey は ON DELETE CASCADE (20251201014342_initial_schema.sql)。
--   このため teams を素朴に DELETE すると、そのチームに紐づく **全メンバーの
--   レース記録 (records) が物理削除される**。記録は個人の資産であり、チームを
--   解散しても本人の手元には残らなければならない。
--
--   **teams に DELETE の RLS ポリシーはもう存在しない** (20260910000000 で
--   teams_delete_creator を DROP 済み)。本 RPC は SECURITY DEFINER (所有者 postgres)
--   であり teams は FORCE ROW LEVEL SECURITY ではないため、ポリシーが無くても
--   関数内の DELETE は成立する。これが唯一の削除経路である。
--
--   よって本 RPC は teams を消す前に records.team_id を NULL 化する。
--   「チーム所属としての記録」ではなくなるが、行そのものは残り個人の記録として
--   参照できる。これが本 RPC の存在理由であり、アプリ側から teams への直接
--   DELETE を発行してはならない (apps/shared/api/teams/core.ts の deleteTeam)。
--
--   **練習も同じ理由で救済する。** practices.team_id CASCADE →
--   practice_logs.practice_id CASCADE で、全メンバーが入力した練習ログ
--   (本数・距離・サークル・タイム) が物理削除される。practice_logs.practice_id は
--   NOT NULL なので records のように自分の列を NULL 化して残すことはできないが、
--   **practices.team_id は NULLABLE** なので親側を個人練習に戻せば丸ごと残せる。
--
--   ⚠️ practices.team_id を NULL 化すると practice_logs の SELECT ポリシーから
--   「チームメンバー」枝が消える。入力者本人が自分のログを見続けられるのは
--   20260909235900 が自己アクセスの枝を足しているからで、**この RPC は
--   20260909235900 より後に適用されなければならない**。
--
-- CASCADE に任せてよいもの (意図的に何もしない):
--   - relay_records.team_id … **意図的に CASCADE**。リレー記録はチームの記録で
--     あり個人には残らない (20260908000000_add_relay_records.sql の既存コメント)。
--     ここで NULL 化してはならない (そもそも NOT NULL 列)。
--   - practices / competitions / entries / announcements / team_memberships /
--     team_groups / user_team_calendar_colors … いずれもチームに従属するデータで
--     あり、チームと一緒に消えるのが正。
--
-- 実装規約:
--   既存 RPC delete_competition_with_records (20260826000000) に倣う:
--   SECURITY DEFINER + SET search_path = public + 関数冒頭の認可ガード +
--   jsonb 返却 + REVOKE ALL FROM PUBLIC, anon + GRANT EXECUTE TO authenticated,
--   service_role。
--
--   EXCEPTION WHEN OTHERS で握りつぶさない: DML 失敗時は例外を呼び出し元まで
--   伝播させる。認可・入力チェックのみ jsonb の success:false で返す。
--
--   🚨 **success:false のときの `error` は「表示用の文言」ではなく「機械可読な
--   識別子」である。** 呼び出し側 (apps/shared/api/teams/core.ts の deleteTeam) は
--   これを TeamOperationError (UserFacingError とは別クラス。表示してよい文言ではないので
--   意図的に分けてある) に載せて投げ、UI 層が
--   getDeleteTeamErrorMessageKey() で i18n キーへ変換して t() で表示する。
--   ここを日本語などの自然言語にすると、5ロケールのうち4つで未翻訳の文字列が
--   そのままユーザーに出る。**訳すな。値も勝手に変えるな** (変えるなら
--   core.ts の DELETE_TEAM_ERROR_MESSAGE_KEYS と messages の3キーを同時に直すこと)。
--
--   本 migration は関数定義 (DDL) と REVOKE/GRANT のみ。データを削除する DML 文は
--   ここには書かない (関数本体の中にのみ存在する)。
-- =============================================================================

CREATE OR REPLACE FUNCTION "public"."delete_team_preserving_records"(
  "p_team_id" "uuid"
) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_caller uuid;
  v_cleared_record_count integer := 0;
  v_cleared_practice_count integer := 0;
  v_deleted_team_count integer := 0;
BEGIN
  -- 未認証は拒否
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'auth_required'
    );
  END IF;

  -- 対象チームの存在確認 (存在しない ID を「成功」で返さない)
  PERFORM 1 FROM public.teams WHERE id = p_team_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'team_not_found'
    );
  END IF;

  -- 🚨 認可チェックは records の UPDATE より **前** に置くこと。後ろに置くと
  -- 権限の無いユーザーでもチームの records から team_id を剥がせてしまう。
  --
  -- 作成者ではない管理者も削除できる (is_team_admin 基準)。created_by 基準にすると
  -- 作成者が脱退したチームを誰も削除できなくなる。
  --
  -- `IS DISTINCT FROM true` を使う理由: `IF NOT <expr>` は expr が NULL のとき
  -- NULL となり plpgsql の IF では偽として扱われる = 認可を素通りする (fail open)。
  -- is_team_admin は EXISTS 由来で現状 NULL を返さないが、判定式の側で塞いでおく。
  IF public.is_team_admin(p_team_id, v_caller) IS DISTINCT FROM true THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'not_authorized'
    );
  END IF;

  -- チーム所属の記録を個人の記録として残す (CASCADE による物理削除を回避する)
  UPDATE public.records SET team_id = NULL WHERE team_id = p_team_id;
  GET DIAGNOSTICS v_cleared_record_count = ROW_COUNT;

  -- チーム練習を個人練習に戻す。ぶら下がる practice_logs / practice_times /
  -- practice_log_tags は親が残ることで丸ごと保持される
  --
  -- 順序依存 (20260919000000 で追加された prevent_unauthorized_team_id_change
  -- トリガとの関係): このトリガは team_id を書き換える UPDATE の権限判定に
  -- is_team_admin(OLD.team_id, auth.uid()) を使う。is_team_admin は
  -- team_memberships を参照するため、この UPDATE は team_memberships が
  -- ON DELETE CASCADE で消える下の `DELETE FROM public.teams` より必ず先に
  -- 実行しなければならない。順序を入れ替えると team_memberships が既に
  -- 無い状態で is_team_admin が false を返し、この正当な UPDATE 自体が
  -- トリガに拒否される (チーム削除機能が壊れる)。
  UPDATE public.practices SET team_id = NULL WHERE team_id = p_team_id;
  GET DIAGNOSTICS v_cleared_practice_count = ROW_COUNT;

  DELETE FROM public.teams WHERE id = p_team_id;
  GET DIAGNOSTICS v_deleted_team_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_team_count', v_deleted_team_count,
    'cleared_record_count', v_cleared_record_count,
    'cleared_practice_count', v_cleared_practice_count
  );
END;
$$;

ALTER FUNCTION "public"."delete_team_preserving_records"("p_team_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."delete_team_preserving_records"("p_team_id" "uuid") IS 'チームを削除する。records_team_id_fkey が ON DELETE CASCADE のため、削除前に records.team_id と practices.team_id を NULL 化して、各メンバーのレース記録と練習ログを個人のデータとして残す。relay_records はチームの記録なので意図的に CASCADE で削除させる。SECURITY DEFINER のため RLS をすり抜けるが、関数内で is_team_admin(team_id, auth.uid()) を満たす管理者のみに削除を許可する。anon は実行不可。失敗時の error は表示文言ではなく機械可読なコード (auth_required / team_not_found / not_authorized) で、文言への変換は UI 層が i18n で行う。';

-- ===========================================================================
-- 権限の再設定: anon への GRANT を剥奪し、authenticated には EXECUTE のみ付与。
-- service_role は従来どおり (サーバー側の信頼済み呼び出し用)。
-- ===========================================================================
REVOKE ALL ON FUNCTION "public"."delete_team_preserving_records"("p_team_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_team_preserving_records"("p_team_id" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."delete_team_preserving_records"("p_team_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."delete_team_preserving_records"("p_team_id" "uuid") TO "service_role";
