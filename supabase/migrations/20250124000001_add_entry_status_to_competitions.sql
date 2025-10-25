-- =============================================================================
-- 大会にエントリーステータスを追加
-- チームでのエントリー一括管理機能のため
-- 作成日: 2025年1月24日
-- =============================================================================

-- 既存のentry_statusカラムを削除（TEXT型）
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'competitions'
        AND column_name = 'entry_status'
    ) THEN
        ALTER TABLE competitions DROP COLUMN entry_status;
        RAISE NOTICE '既存の entry_status カラムを削除しました';
    END IF;
END $$;

-- entry_status型の定義
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entry_status_type') THEN
        CREATE TYPE entry_status_type AS ENUM ('before', 'open', 'closed');
        RAISE NOTICE 'ENUM型 entry_status_type を作成しました';
    ELSE
        RAISE NOTICE 'ENUM型 entry_status_type は既に存在します';
    END IF;
END $$;

-- entry_statusカラムを追加（ENUM型、デフォルト: 'before'）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'competitions'
        AND column_name = 'entry_status'
    ) THEN
        ALTER TABLE competitions 
        ADD COLUMN entry_status entry_status_type NOT NULL DEFAULT 'before';
        
        RAISE NOTICE 'entry_status カラム（ENUM型）を追加しました';
    ELSE
        RAISE NOTICE 'entry_status カラムは既に存在します';
    END IF;
END $$;

-- インデックスの追加（チーム大会でのフィルタリング用）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename = 'competitions' 
        AND indexname = 'idx_competitions_team_id_entry_status'
    ) THEN
        CREATE INDEX idx_competitions_team_id_entry_status 
        ON competitions(team_id, entry_status) 
        WHERE team_id IS NOT NULL;
        
        RAISE NOTICE 'インデックス idx_competitions_team_id_entry_status を作成しました';
    ELSE
        RAISE NOTICE 'インデックス idx_competitions_team_id_entry_status は既に存在します';
    END IF;
END $$;

-- RLSポリシーの更新: チーム管理者のみエントリーステータスを変更可能
-- (既存のRLSポリシーで対応できるため、特別な追加は不要)

-- コメント追加
COMMENT ON COLUMN competitions.entry_status IS 'エントリーステータス: before（受付前）, open（受付中）, closed（受付終了）';

-- =============================================================================
-- マイグレーション完了
-- =============================================================================

