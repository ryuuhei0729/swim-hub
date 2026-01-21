-- =============================================================================
-- Competition Images機能 - マイグレーション
-- 大会に画像を添付する機能を追加（Practice Imagesと同等）
-- =============================================================================

-- competition_imagesテーブル作成
CREATE TABLE "public"."competition_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competition_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "original_path" "text" NOT NULL,
    "thumbnail_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."competition_images" OWNER TO "postgres";

COMMENT ON TABLE "public"."competition_images" IS '大会に添付された画像（最大3枚）';
COMMENT ON COLUMN "public"."competition_images"."original_path" IS 'オリジナル画像のStorageパス';
COMMENT ON COLUMN "public"."competition_images"."thumbnail_path" IS 'サムネイル画像のStorageパス';
COMMENT ON COLUMN "public"."competition_images"."file_name" IS '元ファイル名';
COMMENT ON COLUMN "public"."competition_images"."file_size" IS 'ファイルサイズ（バイト）';
COMMENT ON COLUMN "public"."competition_images"."display_order" IS '表示順序（0から開始）';

-- Primary Key
ALTER TABLE ONLY "public"."competition_images"
    ADD CONSTRAINT "competition_images_pkey" PRIMARY KEY ("id");

-- Foreign Keys
ALTER TABLE ONLY "public"."competition_images"
    ADD CONSTRAINT "competition_images_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."competition_images"
    ADD CONSTRAINT "competition_images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

-- Indexes
CREATE INDEX "idx_competition_images_competition_id" ON "public"."competition_images" USING "btree" ("competition_id");
CREATE INDEX "idx_competition_images_user_id" ON "public"."competition_images" USING "btree" ("user_id");
CREATE INDEX "idx_competition_images_display_order" ON "public"."competition_images" USING "btree" ("competition_id", "display_order");

-- Updated_atトリガー
DROP TRIGGER IF EXISTS "update_competition_images_updated_at" ON "public"."competition_images";
CREATE TRIGGER "update_competition_images_updated_at" BEFORE UPDATE ON "public"."competition_images" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================

ALTER TABLE "public"."competition_images" ENABLE ROW LEVEL SECURITY;

-- SELECT: 本人の画像、またはチーム大会の場合はチームメンバー全員が閲覧可能
CREATE POLICY "Users can view competition images" ON "public"."competition_images"
FOR SELECT USING (
  user_id = (SELECT auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM competitions c
    JOIN team_memberships tm ON tm.team_id = c.team_id
    WHERE c.id = competition_images.competition_id
    AND c.team_id IS NOT NULL
    AND tm.user_id = (SELECT auth.uid())
    AND tm.is_active = true
  )
);

-- INSERT: 本人のみ
CREATE POLICY "Users can insert own competition images" ON "public"."competition_images"
FOR INSERT WITH CHECK (
  user_id = (SELECT auth.uid())
  AND
  EXISTS (
    SELECT 1 FROM competitions c
    WHERE c.id = competition_images.competition_id
    AND c.user_id = (SELECT auth.uid())
  )
);

-- UPDATE: 本人のみ
CREATE POLICY "Users can update own competition images" ON "public"."competition_images"
FOR UPDATE USING (
  user_id = (SELECT auth.uid())
);

-- DELETE: 本人のみ
CREATE POLICY "Users can delete own competition images" ON "public"."competition_images"
FOR DELETE USING (
  user_id = (SELECT auth.uid())
);

-- =============================================================================
-- Storageバケット作成: competition-images
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'competition-images',
  'competition-images',
  true,
  10485760, -- 10MB制限
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Storage RLSポリシー
-- =============================================================================

-- SELECT: 認証済みユーザーは閲覧可能（画像は公開）
DROP POLICY IF EXISTS "Competition images are publicly accessible" ON "storage"."objects";
CREATE POLICY "Competition images are publicly accessible"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR SELECT
  TO public
USING ((bucket_id = 'competition-images'::text));

-- INSERT: 自分のフォルダにのみアップロード可能
DROP POLICY IF EXISTS "Users can upload competition images to own folder" ON "storage"."objects";
CREATE POLICY "Users can upload competition images to own folder"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR INSERT
  TO public
WITH CHECK (
  (bucket_id = 'competition-images'::text)
  AND
  (((SELECT auth.uid()))::text = (string_to_array(name, '/'::text))[1])
  AND
  ((SELECT auth.uid()) IS NOT NULL)
);

-- UPDATE: 自分のフォルダのみ更新可能
DROP POLICY IF EXISTS "Users can update own competition images" ON "storage"."objects";
CREATE POLICY "Users can update own competition images"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR UPDATE
  TO public
USING (
  (bucket_id = 'competition-images'::text)
  AND
  (((SELECT auth.uid()))::text = (string_to_array(name, '/'::text))[1])
  AND
  ((SELECT auth.uid()) IS NOT NULL)
);

-- DELETE: 自分のフォルダのみ削除可能
DROP POLICY IF EXISTS "Users can delete own competition images" ON "storage"."objects";
CREATE POLICY "Users can delete own competition images"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR DELETE
  TO public
USING (
  (bucket_id = 'competition-images'::text)
  AND
  (((SELECT auth.uid()))::text = (string_to_array(name, '/'::text))[1])
  AND
  ((SELECT auth.uid()) IS NOT NULL)
);

-- =============================================================================
-- 権限付与
-- =============================================================================

GRANT SELECT ON TABLE "public"."competition_images" TO "anon";
GRANT ALL ON TABLE "public"."competition_images" TO "authenticated";
GRANT ALL ON TABLE "public"."competition_images" TO "service_role";

