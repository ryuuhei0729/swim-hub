-- practices / competitions の DELETE RLS ポリシーに is_team_admin ガードを追加
-- UPDATE ポリシーと同じパターン: user_id = auth.uid() OR is_team_admin(team_id, auth.uid())

DROP POLICY IF EXISTS "Users can delete own practices" ON "public"."practices";
CREATE POLICY "Users can delete own practices" ON "public"."practices"
FOR DELETE USING (
  ((SELECT "auth"."uid"()) = "user_id")
  OR public.is_team_admin("practices"."team_id", (SELECT "auth"."uid"()))
);

DROP POLICY IF EXISTS "Users can delete own competitions" ON "public"."competitions";
CREATE POLICY "Users can delete own competitions" ON "public"."competitions"
FOR DELETE USING (
  ((SELECT "auth"."uid"()) = "user_id")
  OR public.is_team_admin("competitions"."team_id", (SELECT "auth"."uid"()))
);
