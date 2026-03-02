-- =============================================================================
-- チームグループ機能リファクタリング
-- 1. group_assignments → team_group_memberships にリネーム
-- 2. team_groups に category カラムを追加
-- 3. team_memberships から member_type, group_name を削除
-- 4. team_groups から description カラムを削除
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. group_assignments → team_group_memberships にリネーム
-- ---------------------------------------------------------------------------

-- テーブル名変更
ALTER TABLE "public"."group_assignments" RENAME TO "team_group_memberships";

-- PK制約のリネーム
ALTER TABLE "public"."team_group_memberships"
  RENAME CONSTRAINT "group_assignments_pkey" TO "team_group_memberships_pkey";

-- ユニーク制約のリネーム
ALTER TABLE "public"."team_group_memberships"
  RENAME CONSTRAINT "group_assignments_team_group_id_user_id_key" TO "team_group_memberships_team_group_id_user_id_key";

-- FK制約のリネーム
ALTER TABLE "public"."team_group_memberships"
  RENAME CONSTRAINT "group_assignments_assigned_by_fkey" TO "team_group_memberships_assigned_by_fkey";

ALTER TABLE "public"."team_group_memberships"
  RENAME CONSTRAINT "group_assignments_team_group_id_fkey" TO "team_group_memberships_team_group_id_fkey";

ALTER TABLE "public"."team_group_memberships"
  RENAME CONSTRAINT "group_assignments_user_id_fkey" TO "team_group_memberships_user_id_fkey";

-- インデックスのリネーム
ALTER INDEX "idx_group_assignments_team_group_id" RENAME TO "idx_team_group_memberships_team_group_id";
ALTER INDEX "idx_group_assignments_user_id" RENAME TO "idx_team_group_memberships_user_id";

-- RLSポリシーの再作成（リネーム不可のため drop & create）
DROP POLICY IF EXISTS "Team admins can delete group assignments" ON "public"."team_group_memberships";
DROP POLICY IF EXISTS "Team admins can manage group assignments" ON "public"."team_group_memberships";
DROP POLICY IF EXISTS "Team admins can update group assignments" ON "public"."team_group_memberships";
DROP POLICY IF EXISTS "Team members can view group assignments" ON "public"."team_group_memberships";

CREATE POLICY "Team admins can insert team group memberships"
  ON "public"."team_group_memberships" FOR INSERT
  WITH CHECK (public.is_team_admin((
    SELECT tg.team_id FROM public.team_groups tg WHERE tg.id = team_group_memberships.team_group_id
  ), (SELECT auth.uid())));

CREATE POLICY "Team admins can update team group memberships"
  ON "public"."team_group_memberships" FOR UPDATE
  USING (public.is_team_admin((
    SELECT tg.team_id FROM public.team_groups tg WHERE tg.id = team_group_memberships.team_group_id
  ), (SELECT auth.uid())));

CREATE POLICY "Team admins can delete team group memberships"
  ON "public"."team_group_memberships" FOR DELETE
  USING (public.is_team_admin((
    SELECT tg.team_id FROM public.team_groups tg WHERE tg.id = team_group_memberships.team_group_id
  ), (SELECT auth.uid())));

CREATE POLICY "Team members can view team group memberships"
  ON "public"."team_group_memberships" FOR SELECT
  USING (public.is_team_member((
    SELECT tg.team_id FROM public.team_groups tg WHERE tg.id = team_group_memberships.team_group_id
  ), (SELECT auth.uid())));

-- ---------------------------------------------------------------------------
-- 2. team_groups に category カラムを追加
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."team_groups"
  ADD COLUMN "category" text;

-- team_id + category + name でユニークに変更（同カテゴリ内で名前の重複を防ぐ）
ALTER TABLE "public"."team_groups"
  DROP CONSTRAINT "team_groups_team_id_name_key";

ALTER TABLE "public"."team_groups"
  ADD CONSTRAINT "team_groups_team_id_category_name_key" UNIQUE ("team_id", "category", "name");

COMMENT ON COLUMN "public"."team_groups"."category" IS 'グループのカテゴリ（例: 学年, 期, 種目, タイプ）';

-- ---------------------------------------------------------------------------
-- 3. team_memberships から member_type, group_name を削除
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."team_memberships"
  DROP CONSTRAINT IF EXISTS "team_memberships_member_type_check";

ALTER TABLE "public"."team_memberships"
  DROP COLUMN IF EXISTS "member_type";

ALTER TABLE "public"."team_memberships"
  DROP COLUMN IF EXISTS "group_name";

-- ---------------------------------------------------------------------------
-- 4. team_groups から description カラムを削除
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."team_groups"
  DROP COLUMN IF EXISTS "description";
