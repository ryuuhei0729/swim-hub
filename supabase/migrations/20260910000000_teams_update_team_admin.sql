-- =============================================================================
-- teams: 管理者による更新の解禁と、それに伴う削除経路の封鎖
-- =============================================================================
-- このファイルは3つの変更を1本にまとめている。**3つは分離できない**:
-- (1) だけを適用すると (2) で塞ぐ穴が開いた状態の中間リビジョンが生まれるため。
--
--   (1) teams_update_creator に is_team_admin 分岐を足す (既存バグの修正)
--   (2) created_by / invite_code を BEFORE UPDATE トリガーで不変化する
--   (3) teams_delete_creator を DROP し、削除を RPC 1本に限定する
--
-- -----------------------------------------------------------------------------
-- (1) UPDATE ポリシーの緩和 — 何を直すのか
-- -----------------------------------------------------------------------------
-- 既存バグ: teams_update_creator は created_by = auth.uid() のみを許可していたため、
-- 「作成者ではない管理者」はチーム名・説明を編集できなかった。しかも PostgREST は
-- RLS で弾かれた UPDATE を「0 行・エラー無し」で返すので、画面上は保存に成功した
-- ように見えて値が変わらない (サイレント失敗) になっていた。
--
-- 先例: 20260616000000_team_admin_delete_practices_competitions.sql と同じパターンで
-- `OR public.is_team_admin(<team id>, auth.uid())` を足す。teams テーブル自身が対象
-- なのでチーム ID は "teams"."id"。
--
-- -----------------------------------------------------------------------------
-- (2) なぜ UPDATE を緩めると削除経路が復活するのか (トリガーが必須な理由)
-- -----------------------------------------------------------------------------
-- 🚨 (1) だけを入れると、**records を CASCADE 削除する直接 DELETE の経路が復活する**。
--
--   a. GRANT ALL ON TABLE public.teams TO authenticated (initial_schema.sql:2191) は
--      列レベルの制限が無く、created_by も書き込める
--   b. 作成者でない管理者が PATCH /teams?id=eq.<T> {"created_by": "<自分>"} を送ると、
--      USING は is_team_admin 側で、WITH CHECK は created_by = auth.uid() 側で
--      **両方通ってしまう** (WITH CHECK は「更新後の行」しか見えないので、
--       「created_by が変更されたか」は原理的に判定できない)
--   c. その直後 teams_delete_creator (created_by = auth.uid()) で直接 DELETE が通る
--   d. records_team_id_fkey は ON DELETE CASCADE (initial_schema.sql:1474) なので
--      **全メンバーのレース記録が物理削除される**
--
-- よって「変更されたかどうか」を判定できる唯一の手段である BEFORE UPDATE トリガーで
-- created_by を不変化する。RLS ポリシーでは塞げない。
--
-- invite_code も同時に凍結する。根拠:
--   - アプリ側の型が既に書き込みを禁じている (TeamInsert = Omit<Team, "id" |
--     "invite_code" | ...> なので TeamUpdate にも現れない) = 正規の更新経路が存在しない
--   - 値の生成は BEFORE INSERT トリガー set_team_invite_code が唯一の定義元であり、
--     UPDATE 側にトリガーは無い。凍結しても既存機能と競合しない (実測済み)
--   - UNIQUE 制約つきの参加キーであり、find_team_by_invite_code が参加の入口になる。
--     任意書き換えを許すと他チームのコードを狙った衝突・すり替えの余地が残る
--   再発行が必要になったら、専用の SECURITY DEFINER RPC を足して意図を明示すること。
--
-- -----------------------------------------------------------------------------
-- (3) なぜ DELETE ポリシーごと落とすのか
-- -----------------------------------------------------------------------------
-- (2) のトリガーだけでは「**本物の作成者**による直接 DELETE」が残る。この経路でも
-- records_team_id_fkey の CASCADE で他メンバーのレース記録が消える。ユーザーは
-- 「チームを消しても記録は個人に残す」を明示的に選んでいるので、経路そのものを塞ぐ。
--
-- 削除は delete_team_preserving_records (20260910000001) の1本だけになる。
-- **同 RPC は SECURITY DEFINER (所有者 postgres) であり、teams は FORCE ROW LEVEL
-- SECURITY ではない (relforcerowsecurity = false, 実測済み) ため、DELETE ポリシーが
-- 存在しなくても関数内の DELETE は成立する。** 認可は RPC 冒頭の
-- is_team_admin(team_id, auth.uid()) が担う。
--
-- 直接 DELETE を発行している箇所が他に無いことは実測済み:
--   apps/web / apps/shared / apps/mobile / supabase/functions / scripts / tools の
--   `from("teams")` 全 8 箇所はすべて select / insert / update で、delete は 0 件
--   (apps/shared/api/teams/core.ts の deleteTeam は本スプリントで RPC 経由に置換済み)。
--
-- 作成者のアカウント削除ではチームは消えない (本 migration の対象外・既存仕様):
--   teams_created_by_fkey は public.users への **ON DELETE SET NULL** である。
--   initial_schema.sql:1504 では CASCADE だったが、20260218000000_prepare_account_deletion
--   が created_by を nullable 化したうえで SET NULL へ張り替えた (以後 CASCADE へ戻す
--   migration は無い)。実測: pg_constraint.confdeltype = 'n' /
--   information_schema で teams.created_by は is_nullable = 'YES'。
--   よってアカウント削除では created_by が NULL になるだけでチーム行は残り、
--   チームの大会・練習・お知らせも残る (同 migration が competitions / practices /
--   announcements / team_groups の created_by も同時に SET NULL 化している)。
--
--   🚨 **ここを「退会は全消しが仕様だから」という理由で CASCADE に戻してはいけない。**
--   relay_records_team_id_fkey は teams への本物の ON DELETE CASCADE なので、戻した
--   瞬間に**チーム作成者1人のアカウント削除で、そのチームの全リレー記録が他メンバーの
--   区間タイムごと消える** (relay_record_legs も親から CASCADE で道連れ)。これは (3) で
--   DELETE ポリシーごと塞いだ「チームを消しても記録は個人に残す」判断と正面から矛盾する。
--   アカウント削除で消えるのは本人の records だけで (records_user_id_fkey = CASCADE)、
--   チーム側のリレー記録は relay_record_legs.user_id が SET NULL されて行ごと残る
--   (20260908000000 の設計。表示は displayName = NULL → 「退会したメンバー」)。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- (1) UPDATE: 作成者に加えて管理者も許可する
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "teams_update_creator" ON "public"."teams";

CREATE POLICY "teams_update_creator" ON "public"."teams"
FOR UPDATE USING (
  ("created_by" = (SELECT "auth"."uid"()))
  OR public.is_team_admin("teams"."id", (SELECT "auth"."uid"()))
) WITH CHECK (
  ("created_by" = (SELECT "auth"."uid"()))
  OR public.is_team_admin("teams"."id", (SELECT "auth"."uid"()))
);

-- ---------------------------------------------------------------------------
-- (2) created_by / invite_code の不変化
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."enforce_teams_identity_immutable"()
RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET search_path = public
    AS $$
BEGIN
  -- IS DISTINCT FROM を使う: created_by は NULLABLE であり、`<>` では
  -- NULL 絡みの比較が NULL になって IF を素通りする (fail open)。
  IF NEW."created_by" IS DISTINCT FROM OLD."created_by" THEN
    RAISE EXCEPTION 'チームの作成者は変更できません';
  END IF;

  IF NEW."invite_code" IS DISTINCT FROM OLD."invite_code" THEN
    RAISE EXCEPTION '招待コードは変更できません';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."enforce_teams_identity_immutable"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."enforce_teams_identity_immutable"() IS 'teams.created_by / teams.invite_code を UPDATE で変更させない。RLS の WITH CHECK は更新後の行しか見えず「変更されたか」を判定できないため、所有権のすり替え (created_by を自分に書き換えてから created_by 基準の権限を得る) はトリガーでしか防げない。';

DROP TRIGGER IF EXISTS "enforce_teams_identity_immutable" ON "public"."teams";
CREATE TRIGGER "enforce_teams_identity_immutable"
BEFORE UPDATE ON "public"."teams"
FOR EACH ROW EXECUTE FUNCTION "public"."enforce_teams_identity_immutable"();

-- ---------------------------------------------------------------------------
-- (3) DELETE ポリシーの撤去 (削除は RPC 経由のみ)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "teams_delete_creator" ON "public"."teams";
