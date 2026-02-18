-- アカウント削除に対応するため、チーム関連データのFK制約を
-- CASCADE → SET NULL に変更する。
-- これにより、ユーザー削除時にチームの練習・大会・お知らせ等が
-- 連鎖削除されず、user_id/created_by が NULL になるだけで保持される。

-- ============================================================
-- practices: user_id (NOT NULL → nullable, CASCADE → SET NULL)
-- ============================================================
ALTER TABLE "public"."practices" ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "public"."practices" DROP CONSTRAINT "practices_user_id_fkey";
ALTER TABLE "public"."practices"
  ADD CONSTRAINT "practices_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

-- practices: created_by (already nullable, CASCADE → SET NULL)
ALTER TABLE "public"."practices" DROP CONSTRAINT "practices_created_by_fkey";
ALTER TABLE "public"."practices"
  ADD CONSTRAINT "practices_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

-- ============================================================
-- competitions: user_id (already nullable, CASCADE → SET NULL)
-- ============================================================
ALTER TABLE "public"."competitions" DROP CONSTRAINT "competitions_user_id_fkey";
ALTER TABLE "public"."competitions"
  ADD CONSTRAINT "competitions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;

-- competitions: created_by (already nullable, CASCADE → SET NULL)
ALTER TABLE "public"."competitions" DROP CONSTRAINT "competitions_created_by_fkey";
ALTER TABLE "public"."competitions"
  ADD CONSTRAINT "competitions_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

-- ============================================================
-- teams: created_by (NOT NULL → nullable, CASCADE → SET NULL)
-- ============================================================
ALTER TABLE "public"."teams" ALTER COLUMN "created_by" DROP NOT NULL;

ALTER TABLE "public"."teams" DROP CONSTRAINT "teams_created_by_fkey";
ALTER TABLE "public"."teams"
  ADD CONSTRAINT "teams_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

-- ============================================================
-- announcements: created_by (NOT NULL → nullable, CASCADE → SET NULL)
-- ============================================================
ALTER TABLE "public"."announcements" ALTER COLUMN "created_by" DROP NOT NULL;

ALTER TABLE "public"."announcements" DROP CONSTRAINT "announcements_created_by_fkey";
ALTER TABLE "public"."announcements"
  ADD CONSTRAINT "announcements_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

-- ============================================================
-- team_groups: created_by (NOT NULL → nullable, CASCADE → SET NULL)
-- ============================================================
ALTER TABLE "public"."team_groups" ALTER COLUMN "created_by" DROP NOT NULL;

ALTER TABLE "public"."team_groups" DROP CONSTRAINT "team_groups_created_by_fkey";
ALTER TABLE "public"."team_groups"
  ADD CONSTRAINT "team_groups_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

-- ============================================================
-- group_assignments: assigned_by (NOT NULL → nullable, CASCADE → SET NULL)
-- ============================================================
ALTER TABLE "public"."group_assignments" ALTER COLUMN "assigned_by" DROP NOT NULL;

ALTER TABLE "public"."group_assignments" DROP CONSTRAINT "group_assignments_assigned_by_fkey";
ALTER TABLE "public"."group_assignments"
  ADD CONSTRAINT "group_assignments_assigned_by_fkey"
  FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;

-- ============================================================
-- practice_images: user_id (NOT NULL → nullable, CASCADE → SET NULL)
-- テーブルが存在する場合のみ実行
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'practice_images') THEN
    ALTER TABLE "public"."practice_images" ALTER COLUMN "user_id" DROP NOT NULL;

    ALTER TABLE "public"."practice_images" DROP CONSTRAINT IF EXISTS "practice_images_user_id_fkey";
    ALTER TABLE "public"."practice_images"
      ADD CONSTRAINT "practice_images_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- competition_images: user_id (NOT NULL → nullable, CASCADE → SET NULL)
-- テーブルが存在する場合のみ実行
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'competition_images') THEN
    ALTER TABLE "public"."competition_images" ALTER COLUMN "user_id" DROP NOT NULL;

    ALTER TABLE "public"."competition_images" DROP CONSTRAINT IF EXISTS "competition_images_user_id_fkey";
    ALTER TABLE "public"."competition_images"
      ADD CONSTRAINT "competition_images_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
  END IF;
END $$;
