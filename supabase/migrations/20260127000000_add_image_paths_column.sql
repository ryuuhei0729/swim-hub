-- =============================================================================
-- image_pathsカラム追加マイグレーション
-- practices/competitionsテーブルに直接画像パスを保存
-- practice_images/competition_imagesテーブルを廃止
-- =============================================================================

-- practicesテーブルにimage_pathsカラムを追加
ALTER TABLE "public"."practices"
ADD COLUMN IF NOT EXISTS "image_paths" jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN "public"."practices"."image_paths" IS '画像パスの配列（R2/Storageのパス）';

-- competitionsテーブルにimage_pathsカラムを追加
ALTER TABLE "public"."competitions"
ADD COLUMN IF NOT EXISTS "image_paths" jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN "public"."competitions"."image_paths" IS '画像パスの配列（R2/Storageのパス）';

-- =============================================================================
-- 既存データの移行（practice_imagesテーブルからpractices.image_pathsへ）
-- =============================================================================

UPDATE "public"."practices" p
SET "image_paths" = (
  SELECT COALESCE(
    jsonb_agg("thumbnail_path" ORDER BY "display_order"),
    '[]'::jsonb
  )
  FROM "public"."practice_images" pi
  WHERE pi."practice_id" = p."id"
)
WHERE EXISTS (
  SELECT 1 FROM "public"."practice_images" pi
  WHERE pi."practice_id" = p."id"
);

-- =============================================================================
-- 既存データの移行（competition_imagesテーブルからcompetitions.image_pathsへ）
-- =============================================================================

UPDATE "public"."competitions" c
SET "image_paths" = (
  SELECT COALESCE(
    jsonb_agg("thumbnail_path" ORDER BY "display_order"),
    '[]'::jsonb
  )
  FROM "public"."competition_images" ci
  WHERE ci."competition_id" = c."id"
)
WHERE EXISTS (
  SELECT 1 FROM "public"."competition_images" ci
  WHERE ci."competition_id" = c."id"
);

-- =============================================================================
-- 旧テーブルの削除（データ移行後）
-- =============================================================================

-- practice_imagesテーブルを削除
DROP TABLE IF EXISTS "public"."practice_images" CASCADE;

-- competition_imagesテーブルを削除
DROP TABLE IF EXISTS "public"."competition_images" CASCADE;

-- =============================================================================
-- インデックス追加（image_pathsでのクエリ高速化）
-- =============================================================================

CREATE INDEX IF NOT EXISTS "idx_practices_image_paths"
ON "public"."practices" USING gin ("image_paths");

CREATE INDEX IF NOT EXISTS "idx_competitions_image_paths"
ON "public"."competitions" USING gin ("image_paths");
