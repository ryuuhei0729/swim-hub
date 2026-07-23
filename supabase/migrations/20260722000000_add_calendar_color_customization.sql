-- =============================================================================
-- ダッシュボード記録色カスタマイズ機能
-- =============================================================================
-- 背景:
--   ダッシュボードカレンダーの練習/大会アイテムは現状すべて緑/青の固定色。
--   ユーザーが個人の練習色・大会色、およびチームごとの練習色・大会色を
--   任意にカスタマイズできるようにする。
--
-- 色解決の優先順位 (apps/shared/utils/calendarColorResolver.ts と対応):
--   1. team_id を持つアイテム: チーム別色 > 個人色 > デフォルト
--   2. team_id を持たない個人アイテム: 個人色 > デフォルト
--
-- 色の値はパレット外を許容しない (apps/shared/types/calendarColors.ts の
-- Zod enum でアプリ側バリデーションする)。DB 側は nullable text カラムとし、
-- CHECK 制約は設けない (パレット定義がアプリ側の単一情報源であるため)。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. users テーブルに個人の記録色カラムを追加
-- -----------------------------------------------------------------------------
ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "personal_practice_color" "text",
  ADD COLUMN IF NOT EXISTS "personal_competition_color" "text";

-- -----------------------------------------------------------------------------
-- 2. チーム別の記録色設定テーブル
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."user_team_calendar_colors" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "user_id" "uuid" NOT NULL,
  "team_id" "uuid" NOT NULL,
  "practice_color" "text",
  "competition_color" "text",
  "created_at" timestamp with time zone DEFAULT "now"(),
  "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."user_team_calendar_colors" OWNER TO "postgres";

ALTER TABLE ONLY "public"."user_team_calendar_colors"
  ADD CONSTRAINT "user_team_calendar_colors_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."user_team_calendar_colors"
  ADD CONSTRAINT "user_team_calendar_colors_user_id_team_id_key" UNIQUE ("user_id", "team_id");

ALTER TABLE ONLY "public"."user_team_calendar_colors"
  ADD CONSTRAINT "user_team_calendar_colors_user_id_fkey" FOREIGN KEY ("user_id")
  REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."user_team_calendar_colors"
  ADD CONSTRAINT "user_team_calendar_colors_team_id_fkey" FOREIGN KEY ("team_id")
  REFERENCES "public"."teams"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_user_team_calendar_colors_user_id"
  ON "public"."user_team_calendar_colors" USING "btree" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_user_team_calendar_colors_team_id"
  ON "public"."user_team_calendar_colors" USING "btree" ("team_id");

DROP TRIGGER IF EXISTS "update_user_team_calendar_colors_updated_at" ON "public"."user_team_calendar_colors";
CREATE TRIGGER "update_user_team_calendar_colors_updated_at"
  BEFORE UPDATE ON "public"."user_team_calendar_colors"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- -----------------------------------------------------------------------------
-- 3. RLS 有効化 + ポリシー (practice_tags と同一書式: 本人の行のみ)
-- -----------------------------------------------------------------------------
ALTER TABLE "public"."user_team_calendar_colors" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own calendar colors" ON "public"."user_team_calendar_colors";
CREATE POLICY "Users can view own calendar colors" ON "public"."user_team_calendar_colors"
  FOR SELECT USING (((SELECT "auth"."uid"()) = "user_id"));

DROP POLICY IF EXISTS "Users can insert own calendar colors" ON "public"."user_team_calendar_colors";
CREATE POLICY "Users can insert own calendar colors" ON "public"."user_team_calendar_colors"
  FOR INSERT WITH CHECK (((SELECT "auth"."uid"()) = "user_id"));

DROP POLICY IF EXISTS "Users can update own calendar colors" ON "public"."user_team_calendar_colors";
CREATE POLICY "Users can update own calendar colors" ON "public"."user_team_calendar_colors"
  FOR UPDATE USING (((SELECT "auth"."uid"()) = "user_id"));

DROP POLICY IF EXISTS "Users can delete own calendar colors" ON "public"."user_team_calendar_colors";
CREATE POLICY "Users can delete own calendar colors" ON "public"."user_team_calendar_colors"
  FOR DELETE USING (((SELECT "auth"."uid"()) = "user_id"));

-- -----------------------------------------------------------------------------
-- 4. GRANT (最小権限。20260705000001 で default privileges から anon への
--    自動 GRANT ALL は既に是正済みだが、明示しておく)
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE "public"."user_team_calendar_colors" FROM "anon";
GRANT ALL ON TABLE "public"."user_team_calendar_colors" TO "authenticated";
GRANT ALL ON TABLE "public"."user_team_calendar_colors" TO "service_role";
