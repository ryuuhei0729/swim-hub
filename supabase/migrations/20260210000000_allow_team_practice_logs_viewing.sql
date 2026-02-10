-- チームメンバーがチーム練習のログ・タイム・タグを閲覧可能にする
-- 現状: practice_logs/practice_times/practice_log_tags のSELECTは
--   practices.user_id = auth.uid() のみ許可（練習オーナーのみ）
-- 変更: チーム練習（practices.team_id IS NOT NULL）の場合、
--   チームメンバーも閲覧可能にする

-- practice_logs
DROP POLICY IF EXISTS "Users can view own practice_logs" ON "public"."practice_logs";
CREATE POLICY "Users can view practice_logs" ON "public"."practice_logs"
  FOR SELECT USING (
    EXISTS (
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

-- practice_times
DROP POLICY IF EXISTS "Users can view own practice_times" ON "public"."practice_times";
CREATE POLICY "Users can view practice_times" ON "public"."practice_times"
  FOR SELECT USING (
    EXISTS (
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

-- practice_log_tags
DROP POLICY IF EXISTS "Users can view own practice_log_tags" ON "public"."practice_log_tags";
CREATE POLICY "Users can view practice_log_tags" ON "public"."practice_log_tags"
  FOR SELECT USING (
    EXISTS (
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

-- practice_tags: チーム練習で使用されたタグはチームメンバーも閲覧可能にする
-- practice_log_tags経由でJOINされるため、practice_tagsのRLSも緩和が必要
DROP POLICY IF EXISTS "Users can view own practice_tags" ON "public"."practice_tags";
CREATE POLICY "Users can view practice_tags" ON "public"."practice_tags"
  FOR SELECT USING (
    (SELECT "auth"."uid"()) = "user_id"
    OR EXISTS (
      SELECT 1 FROM "public"."practice_log_tags" "plt"
      JOIN "public"."practice_logs" "pl" ON "pl"."id" = "plt"."practice_log_id"
      JOIN "public"."practices" "p" ON "p"."id" = "pl"."practice_id"
      WHERE "plt"."practice_tag_id" = "practice_tags"."id"
      AND "p"."team_id" IS NOT NULL
      AND "public"."is_team_member"("p"."team_id", (SELECT "auth"."uid"()))
    )
  );
