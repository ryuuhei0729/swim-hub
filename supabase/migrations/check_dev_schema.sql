-- 開発環境（swim-hub-dev）のスキーマ確認用SQL
-- Supabase Dashboard → 開発環境 → SQL Editor で実行してください

-- ============================================
-- 1. entriesテーブルの構造を確認
-- ============================================
SELECT 
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default,
  ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'entries'
ORDER BY ordinal_position;

-- ============================================
-- 2. entriesテーブルの制約を確認
-- ============================================
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
AND tc.table_name = 'entries'
ORDER BY tc.constraint_type, tc.constraint_name;

-- ============================================
-- 3. entriesテーブルのインデックスを確認
-- ============================================
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename = 'entries'
ORDER BY indexname;

-- ============================================
-- 4. entriesテーブルのRLSポリシーを確認
-- ============================================
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'entries'
ORDER BY policyname;

-- ============================================
-- 5. すべてのテーブル一覧
-- ============================================
SELECT 
  table_name,
  (SELECT COUNT(*) 
   FROM information_schema.columns 
   WHERE table_schema = 'public' 
   AND table_name = t.table_name) AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

