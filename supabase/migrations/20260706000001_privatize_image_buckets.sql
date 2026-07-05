-- =============================================================================
-- Issue #36: 画像ストレージが公開バケットで所有者スコープ無し (案B)
-- profile-images / practice-images / competition-images を private 化し、
-- storage.objects の SELECT RLS を所有者スコープに変更する。
-- チーム共有画像の閲覧は、署名付きURL発行API (image-authz.ts) 側の認可で担保する。
--
-- 併せて Issue #40 (C): profile-images の file_size_limit / allowed_mime_types 未設定を
-- 実アップロード経路 (apps/web/app/api/storage/profile/route.ts) の検証値に合わせて設定する。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. バケットを private 化 + profile-images の制限値を実装に合わせる
-- -----------------------------------------------------------------------------
UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 5242880, -- 5MB（apps/web/app/api/storage/profile/route.ts の MAX_FILE_SIZE と一致）
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'profile-images';

UPDATE storage.buckets
SET public = false
WHERE id IN ('practice-images', 'competition-images');

-- -----------------------------------------------------------------------------
-- 2. profile-images: パス規約統一 + 所有者スコープ RLS
--
-- これまで Supabase フォールバック時のみ "avatars/{userId}/{fileName}" という
-- 独自フォルダ規約を使っており (R2 は "{userId}/{fileName}")、ポリシーも
-- string_to_array(name,'/')[2] = auth.uid() と2番目セグメントを見ていた。
-- practice-images / competition-images と同じ "{userId}/{fileName}" 規約に統一し、
-- (アプリ側の変更は apps/web/app/api/storage/profile/route.ts で対応済み)
-- 先頭セグメント (=[1]) を所有者として判定する。
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Profile images are publicly accessible" ON "storage"."objects";
DROP POLICY IF EXISTS "Users can view profile images" ON "storage"."objects";
DROP POLICY IF EXISTS "Users can delete their own profile images" ON "storage"."objects";
DROP POLICY IF EXISTS "Users can update their own profile images" ON "storage"."objects";
DROP POLICY IF EXISTS "Users can upload their own profile images" ON "storage"."objects";

CREATE POLICY "Users can view own profile images"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR SELECT
  TO public
USING (
  (bucket_id = 'profile-images'::text)
  AND (((SELECT auth.uid()))::text = (string_to_array(name, '/'::text))[1])
  AND ((SELECT auth.uid()) IS NOT NULL)
);

CREATE POLICY "Users can upload their own profile images"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR INSERT
  TO public
WITH CHECK (
  (bucket_id = 'profile-images'::text)
  AND (((SELECT auth.uid()))::text = (string_to_array(name, '/'::text))[1])
  AND ((SELECT auth.uid()) IS NOT NULL)
);

CREATE POLICY "Users can update their own profile images"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR UPDATE
  TO public
USING (
  (bucket_id = 'profile-images'::text)
  AND (((SELECT auth.uid()))::text = (string_to_array(name, '/'::text))[1])
  AND ((SELECT auth.uid()) IS NOT NULL)
);

CREATE POLICY "Users can delete their own profile images"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR DELETE
  TO public
USING (
  (bucket_id = 'profile-images'::text)
  AND (((SELECT auth.uid()))::text = (string_to_array(name, '/'::text))[1])
  AND ((SELECT auth.uid()) IS NOT NULL)
);

-- -----------------------------------------------------------------------------
-- 3. practice-images / competition-images: SELECT を所有者スコープに変更
-- (INSERT/UPDATE/DELETE は元々 "{userId}/..." の先頭セグメントで判定済みのため変更不要)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Practice images are publicly accessible" ON "storage"."objects";

CREATE POLICY "Users can view own practice images"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR SELECT
  TO public
USING (
  (bucket_id = 'practice-images'::text)
  AND (((SELECT auth.uid()))::text = (string_to_array(name, '/'::text))[1])
  AND ((SELECT auth.uid()) IS NOT NULL)
);

DROP POLICY IF EXISTS "Competition images are publicly accessible" ON "storage"."objects";

CREATE POLICY "Users can view own competition images"
  ON "storage"."objects"
  AS PERMISSIVE
  FOR SELECT
  TO public
USING (
  (bucket_id = 'competition-images'::text)
  AND (((SELECT auth.uid()))::text = (string_to_array(name, '/'::text))[1])
  AND ((SELECT auth.uid()) IS NOT NULL)
);

-- -----------------------------------------------------------------------------
-- 4. users.profile_image_path: フルURL → バケット内相対パスへの既存データ移行
--
-- 対応するURL形式:
--   - Supabase 公開URL: https://xxx.supabase.co/storage/v1/object/public/profile-images/avatars/{userId}/{file}
--     (ローカル: http://127.0.0.1:54321/storage/v1/object/public/profile-images/avatars/{userId}/{file})
--   - R2 公開URL:        https://{r2-public-domain}/profile-images/{userId}/{file}
-- いずれも "profile-images/" の後ろ（旧 "avatars/" フォルダがあれば除去）を相対パスとして残す。
-- 既にパスのみ (http(s):// で始まらない) の行は対象外 (WHERE句でフィルタ)。
-- -----------------------------------------------------------------------------

UPDATE public.users
SET profile_image_path = regexp_replace(
  profile_image_path,
  '^https?://[^/]+(/storage/v1/object/public)?/profile-images/(avatars/)?',
  ''
)
WHERE profile_image_path ~ '^https?://[^/]+(/storage/v1/object/public)?/profile-images/';

-- 上記パターンに一致しない (未知ドメイン形式等の) フルURLが残っている場合は、
-- このマイグレーションでは変換せず現状維持する。本番適用前に実データで要確認。
