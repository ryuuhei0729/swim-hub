-- =============================================================================
-- 練習データに「自分のものは自分が見える」枝を追加する
-- =============================================================================
-- 背景:
--   practice_logs / practice_times / practice_log_tags の SELECT ポリシーは、
--   可視性を **親 practices 経由でしか与えていない** (20260210000000):
--     practices.user_id = auth.uid()            … 練習の作成者
--     OR (practices.team_id IS NOT NULL AND is_team_member(...))  … チームメンバー
--   つまり「自分が入力したログだから見える」という枝が存在しない。
--
--   チーム削除時に practices.team_id を NULL 化して練習を残す方針
--   (20260910000001 の delete_team_preserving_records) を採ると、チームメンバー枝が
--   死んで作成者枝だけが残る。結果、**行は残るのに入力者本人からは見えない**
--   (実測: メンバー本人から見える自分の practice_logs が 1 → 0 件になる)。
--   一方 records は SELECT ポリシーの第1枝が `auth.uid() = user_id` なので
--   team_id を NULL にしても本人から見え続ける。その差がこの migration の対象。
--
-- 方針:
--   **既存の枝は1つも削らず、OR で自己アクセスの枝を足すだけ。**
--   「元管理者がチーム練習の全員のログを見続ける」現行挙動は仕様として維持する
--   (ユーザーが明示的に許容を選択済み)。ここを狭める変更は含めない。
--
-- 適用順序:
--   **この migration は 20260910000001 (RPC に practices 救済を追加) より前に
--   適用されなければならない。** 逆順だと、適用の合間にチームが削除された場合に
--   「ログは残っているが本人から見えない」窓が開く。ファイル名のタイムスタンプを
--   20260910000000 より手前に置いているのはそのため。
--
-- 🚨 なぜ practices 側だけヘルパー関数なのか (再帰の実測):
--   practices の SELECT ポリシーに `EXISTS (SELECT 1 FROM practice_logs ...)` を
--   直接書くと、practice_logs の SELECT ポリシーが practices を参照しているため
--   相互参照になり、ローカル DB で
--     ERROR: infinite recursion detected in policy for relation "practices"
--   が実際に発生する (実測済み)。既存の is_team_member / is_team_admin と同じく
--   SECURITY DEFINER の判定関数に逃がして RLS の評価を断ち切る。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 判定関数: 指定した練習に「呼び出し元自身」の practice_log がぶら下がっているか
-- ---------------------------------------------------------------------------
-- 🚨 **ユーザー ID を引数に取らない。** 引数で任意の user_id を受けると、
-- SECURITY DEFINER = RLS 迂回なので `POST /rest/v1/rpc/has_own_practice_log` が
-- 「ユーザー U は練習 P にログを持つか」を答える所属推定オラクルになる。
-- 対象を auth.uid() に固定して、他人を指定して探る経路を原理的に無くす。
-- (is_team_member / is_team_admin が uid を引数に取るのは、それらが
--  「チーム内の他人の権限」を問う用途も持つため。この関数は自己判定専用。)
-- 🚨 `CREATE OR REPLACE FUNCTION` は**引数リストが違うとオーバーロードの追加**であって
-- 置換ではない。本 migration の初期版は (practice_id, user_id) の2引数だったため、
-- それを適用済みの環境では2引数版が残る。2引数版は
-- initial_schema.sql:2243 の既定権限で **anon の EXECUTE を持ったまま**であり、
-- 下の REVOKE は1引数版しか名指ししないので届かない = 所属推定オラクルが生き残る。
-- 明示的に落とす。
DROP FUNCTION IF EXISTS "public"."has_own_practice_log"("uuid", "uuid");

CREATE OR REPLACE FUNCTION "public"."has_own_practice_log"(
  "target_practice_id" "uuid"
) RETURNS boolean
    LANGUAGE "sql"
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_logs pl
    WHERE pl.practice_id = target_practice_id
      AND pl.user_id = (SELECT auth.uid())
  );
$$;

ALTER FUNCTION "public"."has_own_practice_log"("target_practice_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."has_own_practice_log"("target_practice_id" "uuid") IS '指定した練習に呼び出し元自身（auth.uid()）の練習ログが存在するかを判定する（RLS回避用）。practices の SELECT ポリシーから practice_logs を直接参照すると相互参照で infinite recursion になるため、is_team_member と同じ SECURITY DEFINER 関数に逃がしている。対象ユーザーを引数に取らないのは、任意の user_id を問い合わせられると所属推定オラクルになるため。anon は実行不可。';

-- ===========================================================================
-- 権限の再設定。
-- initial_schema.sql:2244 の
--   ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon
-- により、**新規関数には放っておくと anon の EXECUTE が付く**。明示的に剥がす。
--
-- ⚠️ authenticated からは剥がさないこと。RLS ポリシー式は呼び出しロールの権限で
-- 評価されるため、剥がすと practices の SELECT が
-- 「permission denied for function has_own_practice_log」で全面的に落ちる。
-- ===========================================================================
REVOKE ALL ON FUNCTION "public"."has_own_practice_log"("target_practice_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."has_own_practice_log"("target_practice_id" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."has_own_practice_log"("target_practice_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."has_own_practice_log"("target_practice_id" "uuid") TO "service_role";

-- ---------------------------------------------------------------------------
-- practices: 自分のログがぶら下がっている練習は見える
-- ---------------------------------------------------------------------------
-- 既存の2枝 (個人練習の本人 / チームメンバー) はそのまま。3枝目を OR で追加する。
-- practices.user_id は NULLABLE で実際に NULL の行が存在するため、user_id に
-- 依存しないこの枝が「作成者不明の練習に自分のログだけが残る」ケースも拾う。
DROP POLICY IF EXISTS "Users can view practices" ON "public"."practices";
CREATE POLICY "Users can view practices" ON "public"."practices" FOR SELECT USING (
  ((("team_id" IS NULL) AND ((SELECT "auth"."uid"()) = "user_id"))
   OR public.is_team_member("practices"."team_id", (SELECT "auth"."uid"()))
   OR public.has_own_practice_log("practices"."id"))
);

-- ---------------------------------------------------------------------------
-- practice_logs: 自分が入力したログは見える
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view practice_logs" ON "public"."practice_logs";
CREATE POLICY "Users can view practice_logs" ON "public"."practice_logs"
  FOR SELECT USING (
    "practice_logs"."user_id" = (SELECT "auth"."uid"())
    OR EXISTS (
      SELECT 1 FROM "public"."practices"
      WHERE "practices"."id" = "practice_logs"."practice_id"
      AND (
        "practices"."user_id" = (SELECT "auth"."uid"())
        OR (
          "practices"."team_id" IS NOT NULL
          AND "public"."is_team_member"("practices"."team_id", (SELECT "auth"."uid"()))
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- practice_times: 自分のタイムは見える
-- ---------------------------------------------------------------------------
-- practice_logs と同じ構造の穴。ここを直さないと「ログ行は見えるがタイムが空」
-- という中途半端な復旧になる (タイムは practice_times に入っている)。
-- practice_times.user_id が存在するので直接比較でよい。
DROP POLICY IF EXISTS "Users can view practice_times" ON "public"."practice_times";
CREATE POLICY "Users can view practice_times" ON "public"."practice_times"
  FOR SELECT USING (
    "practice_times"."user_id" = (SELECT "auth"."uid"())
    OR EXISTS (
      SELECT 1 FROM "public"."practice_logs" "pl"
      JOIN "public"."practices" "p" ON "p"."id" = "pl"."practice_id"
      WHERE "pl"."id" = "practice_times"."practice_log_id"
      AND (
        "p"."user_id" = (SELECT "auth"."uid"())
        OR (
          "p"."team_id" IS NOT NULL
          AND "public"."is_team_member"("p"."team_id", (SELECT "auth"."uid"()))
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- practice_log_tags: 自分のログに付けたタグは見える
-- ---------------------------------------------------------------------------
-- practice_log_tags に user_id 列は無いので、自分の practice_logs 経由で判定する。
-- practice_log_tags → practice_logs → practices → has_own_practice_log
-- (SECURITY DEFINER) と辿るだけで循環しないため、ここはヘルパー不要。
-- なお practice_tags 側は既に `auth.uid() = user_id` の枝を持つので変更不要。
DROP POLICY IF EXISTS "Users can view practice_log_tags" ON "public"."practice_log_tags";
CREATE POLICY "Users can view practice_log_tags" ON "public"."practice_log_tags"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "public"."practice_logs" "pl"
      WHERE "pl"."id" = "practice_log_tags"."practice_log_id"
      AND "pl"."user_id" = (SELECT "auth"."uid"())
    )
    OR EXISTS (
      SELECT 1 FROM "public"."practice_logs" "pl"
      JOIN "public"."practices" "p" ON "p"."id" = "pl"."practice_id"
      WHERE "pl"."id" = "practice_log_tags"."practice_log_id"
      AND (
        "p"."user_id" = (SELECT "auth"."uid"())
        OR (
          "p"."team_id" IS NOT NULL
          AND "public"."is_team_member"("p"."team_id", (SELECT "auth"."uid"()))
        )
      )
    )
  );
