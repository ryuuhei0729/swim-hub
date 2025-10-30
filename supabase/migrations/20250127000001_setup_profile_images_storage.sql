-- プロフィール画像用のStorageバケット設定
-- 既存のprofile-imagesバケットのポリシーを設定

-- バケットが存在しない場合は作成
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-images',
  'profile-images',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- 既存のポリシーを削除（存在する場合）
DROP POLICY IF EXISTS "Users can upload their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Profile images are publicly accessible" ON storage.objects;

-- 認証されたユーザーが自分のプロフィール画像をアップロードできる
-- パス構造: avatars/{userId}/{fileName}
CREATE POLICY "Users can upload their own profile images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'profile-images' 
  AND auth.uid()::text = (string_to_array(name, '/'))[2]
  AND auth.uid() IS NOT NULL
);

-- 認証されたユーザーが自分のプロフィール画像を更新できる
CREATE POLICY "Users can update their own profile images" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'profile-images' 
  AND auth.uid()::text = (string_to_array(name, '/'))[2]
  AND auth.uid() IS NOT NULL
);

-- 認証されたユーザーが自分のプロフィール画像を削除できる
CREATE POLICY "Users can delete their own profile images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'profile-images' 
  AND auth.uid()::text = (string_to_array(name, '/'))[2]
  AND auth.uid() IS NOT NULL
);

-- すべてのユーザーがプロフィール画像を閲覧できる（公開）
CREATE POLICY "Profile images are publicly accessible" ON storage.objects
FOR SELECT USING (bucket_id = 'profile-images');
