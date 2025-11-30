-- =============================================================================
-- attendance_status_type から 'before' を削除
-- - 既存の 'before' 値を 'closed' に移行
-- - デフォルト値を 'open' に変更
-- =============================================================================

-- 1. 既存の 'before' 値を 'closed' に移行
UPDATE public.practices
SET attendance_status = 'closed'::public.attendance_status_type
WHERE attendance_status = 'before'::public.attendance_status_type;

UPDATE public.competitions
SET attendance_status = 'closed'::public.attendance_status_type
WHERE attendance_status = 'before'::public.attendance_status_type;

-- 2. デフォルト値を削除（型変更前に必要）
ALTER TABLE public.practices
ALTER COLUMN attendance_status DROP DEFAULT;

ALTER TABLE public.competitions
ALTER COLUMN attendance_status DROP DEFAULT;

-- 3. 新しいENUM型を作成（'before'なし）
CREATE TYPE public.attendance_status_type_new AS ENUM (
    'open',
    'closed'
);

-- 4. カラムの型を新しいENUM型に変更
ALTER TABLE public.practices
ALTER COLUMN attendance_status TYPE public.attendance_status_type_new
USING attendance_status::text::public.attendance_status_type_new;

ALTER TABLE public.competitions
ALTER COLUMN attendance_status TYPE public.attendance_status_type_new
USING attendance_status::text::public.attendance_status_type_new;

-- 5. 古いENUM型を削除して新しいENUM型に名前を変更
DROP TYPE public.attendance_status_type;
ALTER TYPE public.attendance_status_type_new RENAME TO attendance_status_type;

-- 6. デフォルト値を 'open' に設定
ALTER TABLE public.practices
ALTER COLUMN attendance_status SET DEFAULT 'open'::public.attendance_status_type;

ALTER TABLE public.competitions
ALTER COLUMN attendance_status SET DEFAULT 'open'::public.attendance_status_type;

-- 6. コメントを更新
COMMENT ON COLUMN public.practices.attendance_status IS '出欠提出ステータス: open=提出受付中, closed=提出締切';
COMMENT ON COLUMN public.competitions.attendance_status IS '出欠提出ステータス: open=提出受付中, closed=提出締切';

