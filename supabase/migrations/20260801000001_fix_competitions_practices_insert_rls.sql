-- =============================================================================
-- セキュリティ監査 Critical: C-4 (competitions/practices の team_id 検証漏れ)
-- =============================================================================
--
-- 背景:
--   "Users can create own competitions" (initial_schema.sql:1704) と
--   "Users can insert own practices" (initial_schema.sql:1780) の INSERT
--   ポリシーは WITH CHECK (user_id = auth.uid()) のみで、team_id の所属確認を
--   一切行っていない。そのため非メンバーが任意の他チームの team_id を指定して
--   competitions/practices を INSERT でき、create_attendance_for_team_*
--   トリガー経由で他チームの team_attendance に無関係な行を注入できてしまう。
--
--   同種のテーブルである entries は既に正しいパターンで実装済み
--   ("Users can create own entries", initial_schema.sql:1706-1717):
--     is_team_admin(team_id, auth.uid())
--     OR (user_id = auth.uid() AND (team_id IS NULL OR is_team_member(team_id, auth.uid())))
--
-- 対策: competitions/practices の INSERT ポリシーを entries と同型に置換する。
--
-- 影響確認 (正規フローが壊れない根拠):
--   - 個人記録 (team_id IS NULL): user_id = auth.uid() の枝で従来どおり許可。
--   - 自チームでの作成: is_team_member(team_id, auth.uid()) の枝で許可。
--   - チーム管理者による代理作成: is_team_admin(team_id, auth.uid()) の枝で許可
--     (entries と同じく、管理者は user_id が自分以外でも作成できる)。
--   - 非メンバーによる他チーム team_id の指定のみを新たに拒否する。
--
-- 冪等性: DROP POLICY IF EXISTS の後に CREATE POLICY するのみで、既存データ
-- (行そのもの) には影響しない。
-- =============================================================================

DROP POLICY IF EXISTS "Users can create own competitions" ON "public"."competitions";

CREATE POLICY "Users can create own competitions" ON "public"."competitions" FOR INSERT WITH CHECK (
  public.is_team_admin("competitions"."team_id", (SELECT "auth"."uid"()))
  OR
  (
    ("user_id" = (SELECT "auth"."uid"()))
    AND
    (
      ("team_id" IS NULL)
      OR
      public.is_team_member("competitions"."team_id", (SELECT "auth"."uid"()))
    )
  )
);

DROP POLICY IF EXISTS "Users can insert own practices" ON "public"."practices";

CREATE POLICY "Users can insert own practices" ON "public"."practices" FOR INSERT WITH CHECK (
  public.is_team_admin("practices"."team_id", (SELECT "auth"."uid"()))
  OR
  (
    ("user_id" = (SELECT "auth"."uid"()))
    AND
    (
      ("team_id" IS NULL)
      OR
      public.is_team_member("practices"."team_id", (SELECT "auth"."uid"()))
    )
  )
);
