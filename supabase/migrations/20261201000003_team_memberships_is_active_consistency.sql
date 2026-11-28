-- =============================================================================
-- team_memberships.is_active を status / left_at と必ず一致させる
--
-- is_active は「承認済みで、まだ退会していない」(status = 'approved' AND left_at IS NULL) と
-- 同じ意味のフラグで、RLS や SECURITY DEFINER 関数の多くがこの列で現役メンバーを判定している。
-- 変更前: NULL を許し、status / left_at との一致は書き込む側の注意だけで保たれていた。
--   既定値も status = 'pending' と is_active = true で食い違っていた。
-- 変更後: NOT NULL にし、CHECK で一致を保証する。既定値は pending に合わせて false にする。
--   アプリと RPC (request_join_team / reactivate_own_membership / approve / reject / leave / remove /
--   チーム作成) の書き込みは既にこの関係を守っている。本番の不一致は0件 (2026-11-28 確認)。
--   列そのものを消して式に置き換えるのは、参照する RLS が多いので別の作業にする。
-- =============================================================================

-- 万一の不一致は「権限が弱い側」に倒して揃える (現役扱いを増やさない)
UPDATE "public"."team_memberships"
SET "left_at" = COALESCE("updated_at", now())::date
WHERE "is_active" IS NOT TRUE AND "status" = 'approved' AND "left_at" IS NULL;

UPDATE "public"."team_memberships"
SET "is_active" = false
WHERE "is_active" IS DISTINCT FROM ("status" = 'approved' AND "left_at" IS NULL);

ALTER TABLE "public"."team_memberships" ALTER COLUMN "is_active" SET DEFAULT false;
ALTER TABLE "public"."team_memberships" ALTER COLUMN "is_active" SET NOT NULL;
ALTER TABLE "public"."team_memberships"
  ADD CONSTRAINT "team_memberships_is_active_check"
  CHECK ("is_active" = ("status" = 'approved'::"public"."membership_status_type" AND "left_at" IS NULL));

COMMENT ON COLUMN "public"."team_memberships"."is_active" IS
  '現役メンバーか。status = approved かつ left_at IS NULL と常に一致する (team_memberships_is_active_check)';
