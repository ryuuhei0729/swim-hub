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
-- records に pool_type カラムを追加
--  - 0: 短水路(25m)
--  - 1: 長水路(50m)
-- 既存データのうち competition_id が NULL のものは
-- ユーザーが事前に削除する前提とし、ここでは扱わない。
-- =============================================================================

ALTER TABLE public.records
ADD COLUMN pool_type smallint;

-- 既存データのうち、大会に紐づく記録については competitions.pool_type からコピー
UPDATE public.records r
SET pool_type = c.pool_type
FROM public.competitions c
WHERE r.competition_id = c.id;

-- pool_type が NULL のレコードが残っていないことを確認するためのチェック
-- （本番適用前にローカル/検証環境で SELECT して確認する想定）
-- SELECT COUNT(*) FROM public.records WHERE pool_type IS NULL;

-- すべてのレコードに pool_type が設定されている前提で NOT NULL 制約を追加
ALTER TABLE public.records
ALTER COLUMN pool_type SET NOT NULL;

COMMENT ON COLUMN public.records.pool_type IS '0: 短水路(25m), 1: 長水路(50m)';


