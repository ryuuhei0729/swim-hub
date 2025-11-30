SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- =============================================================================
-- announcements テーブルの更新
-- - published_at カラムを削除
-- - start_at と end_at カラムを追加（表示期間の管理）
-- - set_published_at トリガー関数とトリガーを削除
-- =============================================================================

-- published_at カラムを削除
ALTER TABLE public.announcements
DROP COLUMN IF EXISTS published_at;

-- start_at と end_at カラムを追加
ALTER TABLE public.announcements
ADD COLUMN start_at timestamp with time zone,
ADD COLUMN end_at timestamp with time zone;

-- end_at >= start_at のチェック制約を追加（両方が設定されている場合のみ）
ALTER TABLE public.announcements
ADD CONSTRAINT announcements_end_at_check 
CHECK (end_at IS NULL OR start_at IS NULL OR end_at >= start_at);

-- カラムにコメントを追加
COMMENT ON COLUMN public.announcements.start_at IS '表示開始日時（NULLの場合は期間制限なし）';
COMMENT ON COLUMN public.announcements.end_at IS '表示終了日時（NULLの場合は期間制限なし）';

-- set_published_at トリガーを削除
DROP TRIGGER IF EXISTS set_announcement_published_at ON public.announcements;

-- set_published_at 関数を削除（他で使用されていない場合）
DROP FUNCTION IF EXISTS public.set_published_at();

