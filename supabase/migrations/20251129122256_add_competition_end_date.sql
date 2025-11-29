-- =============================================================================
-- マイグレーション: competitionsテーブルにend_dateカラムを追加
-- 複数日開催の大会に対応
-- =============================================================================

-- 1. end_dateカラムを追加（Nullable）
ALTER TABLE "public"."competitions" 
ADD COLUMN "end_date" "date";

-- コメント追加
COMMENT ON COLUMN "public"."competitions"."end_date" IS '大会終了日（複数日開催の場合）。NULLの場合は単日開催。';

-- 2. バリデーション制約（end_date >= date）
ALTER TABLE "public"."competitions"
ADD CONSTRAINT "competitions_end_date_check" 
CHECK (("end_date" IS NULL) OR ("end_date" >= "date"));

-- 3. end_dateカラムにインデックスを追加（カレンダービューのパフォーマンス向上）
CREATE INDEX "idx_competitions_end_date" ON "public"."competitions" USING "btree" ("end_date");

-- 4. calendar_viewビューを再作成（複数日開催大会の日付展開対応）
DROP VIEW IF EXISTS "public"."calendar_view";

CREATE OR REPLACE VIEW "public"."calendar_view" WITH ("security_invoker"='true') AS
-- 個人練習（練習ログなし）
SELECT "p"."id",
    'practice'::"text" AS "item_type",
    "p"."date" AS "item_date",
    '練習'::"text" AS "title",
    "p"."place",
    "p"."note",
    "jsonb_build_object"('practice', "to_jsonb"("p".*), 'user_id', "p"."user_id") AS "metadata"
  FROM "public"."practices" "p"
  WHERE (("p"."user_id" = (SELECT "auth"."uid"())) AND ("p"."team_id" IS NULL) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."practice_logs" "pl"
          WHERE ("pl"."practice_id" = "p"."id")))))
UNION ALL
-- チーム練習（練習ログなし）
SELECT "p"."id",
    'team_practice'::"text" AS "item_type",
    "p"."date" AS "item_date",
    'チーム練習'::"text" AS "title",
    "p"."place",
    "p"."note",
    "jsonb_build_object"('practice', "to_jsonb"("p".*), 'user_id', "p"."user_id", 'team_id', "p"."team_id", 'team', "to_jsonb"("t".*)) AS "metadata"
  FROM ("public"."practices" "p"
    JOIN "public"."teams" "t" ON (("t"."id" = "p"."team_id")))
  WHERE (("p"."team_id" IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."practice_logs" "pl"
          WHERE ("pl"."practice_id" = "p"."id")))) AND (EXISTS ( SELECT 1
          FROM "public"."team_memberships" "tm"
          WHERE (("tm"."team_id" = "p"."team_id") AND ("tm"."user_id" = (SELECT "auth"."uid"())) AND ("tm"."is_active" = true)))))
UNION ALL
-- 個人練習ログ
SELECT "pl"."id",
    'practice_log'::"text" AS "item_type",
    "p"."date" AS "item_date",
        CASE
            WHEN ("pl"."set_count" = 1) THEN (((("pl"."distance")::"text" || 'm × '::"text") || ("pl"."rep_count")::"text") || '本'::"text")
            ELSE (((((("pl"."distance")::"text" || 'm × '::"text") || ("pl"."rep_count")::"text") || '本 × '::"text") || ("pl"."set_count")::"text") || 'セット'::"text")
        END AS "title",
    "p"."place",
    "pl"."note",
    "jsonb_build_object"('practice_log', "to_jsonb"("pl".*), 'practice', "to_jsonb"("p".*), 'user_id', "pl"."user_id") AS "metadata"
  FROM ("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
  WHERE (("pl"."user_id" = (SELECT "auth"."uid"())) AND ("p"."team_id" IS NULL))
UNION ALL
-- チーム練習ログ
SELECT "pl"."id",
    'practice_log'::"text" AS "item_type",
    "p"."date" AS "item_date",
        CASE
            WHEN ("pl"."set_count" = 1) THEN (((("pl"."distance")::"text" || 'm × '::"text") || ("pl"."rep_count")::"text") || '本'::"text")
            ELSE (((((("pl"."distance")::"text" || 'm × '::"text") || ("pl"."rep_count")::"text") || '本 × '::"text") || ("pl"."set_count")::"text") || 'セット'::"text")
        END AS "title",
    "p"."place",
    "pl"."note",
    "jsonb_build_object"('practice_log', "to_jsonb"("pl".*), 'practice', "to_jsonb"("p".*), 'user_id', "pl"."user_id", 'team_id', "p"."team_id", 'team', "to_jsonb"("t".*)) AS "metadata"
  FROM (("public"."practice_logs" "pl"
    JOIN "public"."practices" "p" ON (("p"."id" = "pl"."practice_id")))
    JOIN "public"."teams" "t" ON (("t"."id" = "p"."team_id")))
  WHERE (("p"."team_id" IS NOT NULL) AND (EXISTS ( SELECT 1
          FROM "public"."team_memberships" "tm"
          WHERE (("tm"."team_id" = "p"."team_id") AND ("tm"."user_id" = (SELECT "auth"."uid"())) AND ("tm"."is_active" = true)))))
UNION ALL
-- 個人大会（記録・エントリーなし）- 複数日展開対応
SELECT "c"."id",
    'competition'::"text" AS "item_type",
    "d"."date"::date AS "item_date",
    "c"."title",
    "c"."place",
    "c"."note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id", 'pool_type', "c"."pool_type", 'is_multi_day', "c"."end_date" IS NOT NULL) AS "metadata"
  FROM "public"."competitions" "c"
  CROSS JOIN LATERAL generate_series("c"."date", COALESCE("c"."end_date", "c"."date"), '1 day'::interval) AS "d"("date")
  WHERE (("c"."user_id" = (SELECT "auth"."uid"())) AND ("c"."team_id" IS NULL) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE (("r"."competition_id" = "c"."id") AND ("r"."user_id" = (SELECT "auth"."uid"())))))) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."entries" "e"
          WHERE (("e"."competition_id" = "c"."id") AND ("e"."user_id" = (SELECT "auth"."uid"())) AND ("e"."team_id" IS NULL))))))
UNION ALL
-- チーム大会（記録・エントリーなし）- 複数日展開対応
SELECT "c"."id",
    'team_competition'::"text" AS "item_type",
    "d"."date"::date AS "item_date",
    "c"."title",
    "c"."place",
    "c"."note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id", 'team_id', "c"."team_id", 'team', "to_jsonb"("t".*), 'pool_type', "c"."pool_type", 'is_multi_day', "c"."end_date" IS NOT NULL) AS "metadata"
  FROM ("public"."competitions" "c"
    JOIN "public"."teams" "t" ON (("t"."id" = "c"."team_id")))
  CROSS JOIN LATERAL generate_series("c"."date", COALESCE("c"."end_date", "c"."date"), '1 day'::interval) AS "d"("date")
  WHERE (("c"."team_id" IS NOT NULL) AND (EXISTS ( SELECT 1
          FROM "public"."team_memberships" "tm"
          WHERE (("tm"."team_id" = "c"."team_id") AND ("tm"."user_id" = (SELECT "auth"."uid"())) AND ("tm"."is_active" = true)))) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE (("r"."competition_id" = "c"."id") AND ("r"."user_id" = (SELECT "auth"."uid"())))))) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."entries" "e"
          WHERE (("e"."competition_id" = "c"."id") AND ("e"."user_id" = (SELECT "auth"."uid"())) AND ("e"."team_id" IS NOT NULL))))))
UNION ALL
-- 個人エントリー（記録なし）- 複数日展開対応
SELECT "c"."id",
    'entry'::"text" AS "item_type",
    "d"."date"::date AS "item_date",
    "c"."title",
    "c"."place",
    NULL::"text" AS "note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id", 'is_multi_day', "c"."end_date" IS NOT NULL) AS "metadata"
  FROM "public"."competitions" "c"
  CROSS JOIN LATERAL generate_series("c"."date", COALESCE("c"."end_date", "c"."date"), '1 day'::interval) AS "d"("date")
  WHERE (("c"."user_id" = (SELECT "auth"."uid"())) AND ("c"."team_id" IS NULL) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE (("r"."competition_id" = "c"."id") AND ("r"."user_id" = (SELECT "auth"."uid"())))))) AND (EXISTS ( SELECT 1
          FROM "public"."entries" "e"
          WHERE (("e"."competition_id" = "c"."id") AND ("e"."user_id" = (SELECT "auth"."uid"())) AND ("e"."team_id" IS NULL)))))
UNION ALL
-- チームエントリー（記録なし）- 複数日展開対応
SELECT "c"."id",
    'entry'::"text" AS "item_type",
    "d"."date"::date AS "item_date",
    "c"."title",
    "c"."place",
    NULL::"text" AS "note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id", 'team_id', "c"."team_id", 'team', "to_jsonb"("t".*), 'is_multi_day', "c"."end_date" IS NOT NULL) AS "metadata"
  FROM ("public"."competitions" "c"
    JOIN "public"."teams" "t" ON (("t"."id" = "c"."team_id")))
  CROSS JOIN LATERAL generate_series("c"."date", COALESCE("c"."end_date", "c"."date"), '1 day'::interval) AS "d"("date")
  WHERE (("c"."team_id" IS NOT NULL) AND (EXISTS ( SELECT 1
          FROM "public"."team_memberships" "tm"
          WHERE (("tm"."team_id" = "c"."team_id") AND ("tm"."user_id" = (SELECT "auth"."uid"())) AND ("tm"."is_active" = true)))) AND (NOT (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE (("r"."competition_id" = "c"."id") AND ("r"."user_id" = (SELECT "auth"."uid"())))))) AND (EXISTS ( SELECT 1
          FROM "public"."entries" "e"
          WHERE (("e"."competition_id" = "c"."id") AND ("e"."user_id" = (SELECT "auth"."uid"())) AND ("e"."team_id" IS NOT NULL)))))
UNION ALL
-- 個人記録 - 複数日展開対応
SELECT "c"."id",
    'record'::"text" AS "item_type",
    "d"."date"::date AS "item_date",
    "c"."title",
    "c"."place",
    NULL::"text" AS "note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id", 'pool_type', "c"."pool_type", 'is_multi_day', "c"."end_date" IS NOT NULL) AS "metadata"
  FROM "public"."competitions" "c"
  CROSS JOIN LATERAL generate_series("c"."date", COALESCE("c"."end_date", "c"."date"), '1 day'::interval) AS "d"("date")
  WHERE (("c"."user_id" = (SELECT "auth"."uid"())) AND ("c"."team_id" IS NULL) AND (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE (("r"."competition_id" = "c"."id") AND ("r"."user_id" = (SELECT "auth"."uid"()))))))
UNION ALL
-- チーム記録 - 複数日展開対応
SELECT "c"."id",
    'record'::"text" AS "item_type",
    "d"."date"::date AS "item_date",
    "c"."title",
    "c"."place",
    NULL::"text" AS "note",
    "jsonb_build_object"('competition', "to_jsonb"("c".*), 'user_id', "c"."user_id", 'team_id', "c"."team_id", 'team', "to_jsonb"("t".*), 'pool_type', "c"."pool_type", 'is_multi_day', "c"."end_date" IS NOT NULL) AS "metadata"
  FROM ("public"."competitions" "c"
    JOIN "public"."teams" "t" ON (("t"."id" = "c"."team_id")))
  CROSS JOIN LATERAL generate_series("c"."date", COALESCE("c"."end_date", "c"."date"), '1 day'::interval) AS "d"("date")
  WHERE (("c"."team_id" IS NOT NULL) AND (EXISTS ( SELECT 1
          FROM "public"."team_memberships" "tm"
          WHERE (("tm"."team_id" = "c"."team_id") AND ("tm"."user_id" = (SELECT "auth"."uid"())) AND ("tm"."is_active" = true)))) AND (EXISTS ( SELECT 1
          FROM "public"."records" "r"
          WHERE (("r"."competition_id" = "c"."id") AND ("r"."user_id" = (SELECT "auth"."uid"()))))));

ALTER VIEW "public"."calendar_view" OWNER TO "postgres";

COMMENT ON VIEW "public"."calendar_view" IS 'カレンダー表示用の統合ビュー（練習、練習ログ、大会、エントリー、記録を含む）。placeカラムで統一。複数日開催の大会は各日に展開される。';

-- 権限設定
GRANT ALL ON TABLE "public"."calendar_view" TO "anon";
GRANT ALL ON TABLE "public"."calendar_view" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_view" TO "service_role";

