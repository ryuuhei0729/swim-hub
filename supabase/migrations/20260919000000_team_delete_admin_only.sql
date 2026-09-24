-- チーム大会/チーム練習の個人削除を禁止する。
--
-- 背景: 20260616000000 で追加した DELETE ポリシーは
--   (auth.uid() = user_id) OR is_team_admin(team_id, auth.uid())
-- という OR 構成のため、team_id IS NOT NULL な行 (チーム大会/チーム練習) でも
-- 作成者本人であれば admin でなくても削除できてしまう。
-- 「チーム大会/練習はチーム管理者のみが削除できる」という要件に対し、
-- team_id の有無で分岐を明示的に分離する。

DROP POLICY IF EXISTS "Users can delete own practices" ON "public"."practices";
CREATE POLICY "Users can delete own practices" ON "public"."practices"
FOR DELETE USING (
  ("team_id" IS NULL AND (SELECT "auth"."uid"()) = "user_id")
  OR ("team_id" IS NOT NULL AND public.is_team_admin("practices"."team_id", (SELECT "auth"."uid"())))
);

DROP POLICY IF EXISTS "Users can delete own competitions" ON "public"."competitions";
CREATE POLICY "Users can delete own competitions" ON "public"."competitions"
FOR DELETE USING (
  ("team_id" IS NULL AND (SELECT "auth"."uid"()) = "user_id")
  OR ("team_id" IS NOT NULL AND public.is_team_admin("competitions"."team_id", (SELECT "auth"."uid"())))
);

-- delete_competition_with_records は個人大会削除専用の RPC。
-- チーム大会 (team_id IS NOT NULL) は admin であっても本 RPC 経由の削除を拒否する
-- (チーム大会の削除はチーム管理画面の別経路に限定する)。
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

  -- チーム大会は本 RPC の対象外。admin であっても拒否する
  -- (チーム大会削除はチーム管理画面の別経路に限定するため)。
  IF v_competition_team_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'team competition cannot be deleted via this function'
    );
  END IF;

  -- 個人大会: 紐づく records を先に削除する
  -- (records_competition_id_fkey は ON DELETE SET NULL のため、
  --  competitions を先に削除しても records は自然には消えない)
  DELETE FROM public.records WHERE competition_id = p_competition_id;
  GET DIAGNOSTICS v_deleted_record_count = ROW_COUNT;

  DELETE FROM public.competitions WHERE id = p_competition_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_record_count', v_deleted_record_count
  );
END;
$$;

ALTER FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") IS '個人大会 (team_id IS NULL) を削除する。紐づく records も削除し、削除件数を返す。チーム大会 (team_id IS NOT NULL) は admin であっても拒否する。SECURITY DEFINER のため RLS をすり抜けるが、関数内で作成者本人 (auth.uid() = competitions.user_id) のみに削除を許可する。anon は実行不可。';

REVOKE ALL ON FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."delete_competition_with_records"("p_competition_id" "uuid") TO "service_role";

-- =============================================================================
-- team_id の不変性を担保する BEFORE UPDATE トリガ (PM 実測による追加分)
-- =============================================================================
-- 背景:
--   practices / competitions の UPDATE ポリシー ("Users can update own
--   practices" / "Users can update own competitions", 20251201014342) には
--   WITH CHECK が無い。WITH CHECK を省略した場合 Postgres は USING を NEW 行に
--   対して評価するが、USING は `user_id = auth.uid() OR is_team_admin(team_id,
--   auth.uid())` という OR 構成のため、team_id を NULL に書き換えた NEW 行でも
--   `user_id = auth.uid()` (作成者本人であることは変わらない) が真になり素通りする。
--   つまり非 admin の作成者が UPDATE で team_id を NULL 化してから DELETE すれば、
--   本 migration の DELETE ガード強化を迂回できる。
--
--   これは RLS (USING/WITH CHECK は NEW 行のみ参照可能) では表現できない
--   ("旧 team_id に対して admin だったか" は OLD 行の値が必要) ため、
--   OLD/NEW を比較できる BEFORE UPDATE トリガで防ぐ。
--
--   apps/shared/api の updatePractice()/updateCompetition() 呼び出し元を
--   全数実測した結果、team_id を UPDATE で変更する正当な経路はアプリ側には
--   存在しない (team_id は INSERT 時のみ設定される)。ただし
--   delete_team_preserving_records RPC (20260910000001) が、チーム削除時に
--   practices.team_id を NULL 化して個人練習として残す正当な経路を持つ。
--   このRPCは実行前に is_team_admin(p_team_id, auth.uid()) を検証済みである。
--
--   Reviewer 指摘 (修正ラウンド1 F2): 初版は「変更前 (OLD) の team_id に対して
--   admin であること」しか要求しておらず、移動先 (NEW) の team_id に対する
--   admin 権限を検証していなかった。これだと「作成者かつ現チーム admin」が
--   直接 UPDATE で他チームへ team_id を付け替えられてしまう (相手チームの同意
--   なくデータを押し付けられる)。
--
--   修正ラウンド2 (PM 裁定撤回): 当初は「移動元・移動先どちらの admin でもあれば
--   付け替えを許可する」方針で実装したが、Reviewer が副作用を指摘したため撤回する。
--   `entries.team_id` / `records.team_id` は `competitions.team_id` とは独立した
--   外部キー列であり、本トリガの対象 (practices/competitions) の team_id を
--   書き換えても追随しない。大会を Team A → Team B に付け替えると、大会自体は
--   Team B の一覧に現れるが、紐づく records/entries は team_id = A のままになる。
--   records の RLS は records.team_id を直接参照する (competitions.team_id 経由
--   ではない) ため、Team B からその大会を開いても記録が0件に見えるデータ不整合が
--   生まれる。これを解消する正当なアプリ経路は存在しない (apps/shared/api の
--   update 系呼び出しを全数実測し、team_id を非NULLに設定する UPDATE は無いことを
--   確認済み)。必要のない書き換え能力を、既知の不整合付きで開けておく理由がない
--   ため、非NULLへの付け替えは admin 権限の有無に関わらず一律拒否する
--   (将来「両方の admin なら許可してよいのでは」と緩められることを防ぐため、
--   理由をここに明記する)。
--
--   許可するのは NEW.team_id IS NULL (チーム解除) のケースのみ。
--   delete_team_preserving_records RPC (20260910000001) がチーム削除時に
--   practices.team_id を NULL 化して個人練習として残す唯一の正当な経路であり、
--   これは OLD.team_id に対する admin 権限を要求した上で必ず許可する
--   (塞ぐとチーム削除機能が壊れる)。
--
--   OLD.team_id IS NULL の個人大会/練習に team_id を後付けする書き換えも
--   NEW.team_id IS NOT NULL に該当するため同様に拒否される。「個人大会/練習を
--   後からチーム大会/練習に変換する」機能はアプリ側に存在しないことを実測確認済み
--   (grep で team_id を UPDATE payload に含む呼び出しが無いことを確認)。
--
--   records には本トリガを適用しない。records の削除は team_id の有無を問わず
--   従来通り許可する仕様のため (Sprint Contract SC5)、対象外は意図的。
CREATE OR REPLACE FUNCTION "public"."prevent_unauthorized_team_id_change"()
RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET search_path = public
    AS $$
BEGIN
  IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN
    IF NEW.team_id IS NOT NULL THEN
      -- 非NULLへの付け替え (個人→チーム/チームA→チームB) は admin であっても
      -- 一律拒否する。理由は関数定義直前のコメント参照
      -- (entries/records.team_id が追随せずデータ不整合を生むため)。
      RAISE EXCEPTION 'team_id cannot be set to a non-null value via UPDATE; it may only be cleared to NULL by an admin of the current team';
    END IF;

    -- ここに到達するのは NEW.team_id IS NULL (チーム解除) のケースのみ。
    -- delete_team_preserving_records RPC の救済経路のため、旧チームの admin で
    -- あることを要求した上で許可する。
    -- `IS DISTINCT FROM true` を使う理由: `IF NOT <expr>` は expr が NULL の
    -- とき NULL となり plpgsql の IF では偽として扱われる (fail open)。
    IF public.is_team_admin(OLD.team_id, (SELECT "auth"."uid"())) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'team_id cannot be cleared unless caller is admin of the current team';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "practices_prevent_team_id_change" ON "public"."practices";
CREATE TRIGGER "practices_prevent_team_id_change"
  BEFORE UPDATE ON "public"."practices"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."prevent_unauthorized_team_id_change"();

DROP TRIGGER IF EXISTS "competitions_prevent_team_id_change" ON "public"."competitions";
CREATE TRIGGER "competitions_prevent_team_id_change"
  BEFORE UPDATE ON "public"."competitions"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."prevent_unauthorized_team_id_change"();
