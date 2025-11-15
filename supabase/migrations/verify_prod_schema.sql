-- 本番環境のスキーマが正しく適用されたか確認するSQL
-- Supabase Dashboard → 本番環境 → SQL Editor で実行してください

-- ============================================
-- 1. テーブル一覧とカラム数を確認
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

-- ============================================
-- 2. entriesテーブルの構造を確認
-- ============================================
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default,
  ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'entries'
ORDER BY ordinal_position;

-- ============================================
-- 3. entriesテーブルの制約を確認
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
-- 4. entriesテーブルのインデックスを確認
-- ============================================
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename = 'entries'
ORDER BY indexname;

-- ============================================
-- 5. RLSポリシーが有効か確認
-- ============================================
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'entries';

-- ============================================
-- 6. entriesテーブルのRLSポリシーを確認
-- ============================================
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'entries'
ORDER BY policyname;

-- ============================================
-- 7. すべてのテーブルでRLSが有効か確認
-- ============================================
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

