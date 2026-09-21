-- チーム大会/チーム練習の個人「編集」を禁止する。
--
-- 背景: 20251201014342 で追加した UPDATE ポリシーは
--   (user_id = auth.uid()) OR is_team_admin(team_id, auth.uid())
-- という OR 構成のため、team_id IS NOT NULL な行 (チーム大会/チーム練習) でも
-- 作成者本人であれば admin でなくても basicData を編集できてしまう。
-- DELETE ポリシー (20260919000000) と対称の形に揃え、team_id の有無で
-- 分岐を明示的に分離する。USING と WITH CHECK の両方に適用する
-- (WITH CHECK が無いと新行 (NEW) の再評価に USING がそのまま使われ、
--  同じ抜け道が残る)。
--
-- team_id 自体の変更は 20260919000000 で追加済みの
-- prevent_unauthorized_team_id_change トリガがカバーしている。本 migration は
-- 触らない。

DROP POLICY IF EXISTS "Users can update own practices" ON "public"."practices";
CREATE POLICY "Users can update own practices" ON "public"."practices"
FOR UPDATE
USING (
  ("team_id" IS NULL AND (SELECT "auth"."uid"()) = "user_id")
  OR ("team_id" IS NOT NULL AND public.is_team_admin("practices"."team_id", (SELECT "auth"."uid"())))
)
WITH CHECK (
  ("team_id" IS NULL AND (SELECT "auth"."uid"()) = "user_id")
  OR ("team_id" IS NOT NULL AND public.is_team_admin("practices"."team_id", (SELECT "auth"."uid"())))
);

DROP POLICY IF EXISTS "Users can update own competitions" ON "public"."competitions";
CREATE POLICY "Users can update own competitions" ON "public"."competitions"
FOR UPDATE
USING (
  ("team_id" IS NULL AND (SELECT "auth"."uid"()) = "user_id")
  OR ("team_id" IS NOT NULL AND public.is_team_admin("competitions"."team_id", (SELECT "auth"."uid"())))
)
WITH CHECK (
  ("team_id" IS NULL AND (SELECT "auth"."uid"()) = "user_id")
  OR ("team_id" IS NOT NULL AND public.is_team_admin("competitions"."team_id", (SELECT "auth"."uid"())))
);
