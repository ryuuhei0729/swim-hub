-- =============================================================================
-- エントリーテーブルの個人・チーム共通化マイグレーション
-- team_entries -> entries にリネーム、team_idをNullableに変更
-- 作成日: 2025年1月23日
-- =============================================================================

-- =============================================================================
-- 1. テーブル名変更
-- =============================================================================

-- team_entriesテーブルが存在する場合のみentriesにリネーム
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'team_entries'
    ) THEN
        ALTER TABLE team_entries RENAME TO entries;
        RAISE NOTICE 'テーブル team_entries を entries にリネームしました';
    ELSE
        RAISE NOTICE 'テーブル team_entries は既に存在しないか、既に entries にリネーム済みです';
    END IF;
END $$;

-- =============================================================================
-- 2. team_idカラムをNullableに変更
-- =============================================================================

-- team_idの NOT NULL 制約を削除（個人エントリーも可能にする）
DO $$
BEGIN
    -- entriesテーブルが存在する場合のみ実行
    IF EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'entries'
    ) THEN
        -- team_idカラムがNOT NULLの場合のみ制約を削除
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'entries'
            AND column_name = 'team_id'
            AND is_nullable = 'NO'
        ) THEN
            ALTER TABLE entries ALTER COLUMN team_id DROP NOT NULL;
            RAISE NOTICE 'team_id カラムをNullableに変更しました';
        ELSE
            RAISE NOTICE 'team_id カラムは既にNullableです';
        END IF;
    END IF;
END $$;

-- =============================================================================
-- 3. インデックス名と制約名の更新
-- =============================================================================

-- 既存のインデックスをリネーム（存在する場合のみ）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_team_entries_team_id') THEN
        ALTER INDEX idx_team_entries_team_id RENAME TO idx_entries_team_id;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_team_entries_competition_id') THEN
        ALTER INDEX idx_team_entries_competition_id RENAME TO idx_entries_competition_id;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_team_entries_user_id') THEN
        ALTER INDEX idx_team_entries_user_id RENAME TO idx_entries_user_id;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_team_entries_style_id') THEN
        ALTER INDEX idx_team_entries_style_id RENAME TO idx_entries_style_id;
    END IF;
END $$;

-- 外部キー制約をリネーム（存在する場合のみ）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_entries_user_id_fkey') THEN
        ALTER TABLE entries RENAME CONSTRAINT team_entries_user_id_fkey TO entries_user_id_fkey;
        RAISE NOTICE '外部キー制約 team_entries_user_id_fkey を entries_user_id_fkey にリネームしました';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_entries_team_id_fkey') THEN
        ALTER TABLE entries RENAME CONSTRAINT team_entries_team_id_fkey TO entries_team_id_fkey;
        RAISE NOTICE '外部キー制約 team_entries_team_id_fkey を entries_team_id_fkey にリネームしました';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_entries_competition_id_fkey') THEN
        ALTER TABLE entries RENAME CONSTRAINT team_entries_competition_id_fkey TO entries_competition_id_fkey;
        RAISE NOTICE '外部キー制約 team_entries_competition_id_fkey を entries_competition_id_fkey にリネームしました';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_entries_style_id_fkey') THEN
        ALTER TABLE entries RENAME CONSTRAINT team_entries_style_id_fkey TO entries_style_id_fkey;
        RAISE NOTICE '外部キー制約 team_entries_style_id_fkey を entries_style_id_fkey にリネームしました';
    END IF;
END $$;

-- ユニーク制約の名前を更新（存在する場合のみ）
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'team_entries_competition_id_user_id_style_id_key'
    ) THEN
        ALTER TABLE entries RENAME CONSTRAINT team_entries_competition_id_user_id_style_id_key TO entries_competition_id_user_id_style_id_key;
    END IF;
END $$;

-- =============================================================================
-- 4. トリガー名の更新
-- =============================================================================

-- 既存のトリガーをリネーム（存在する場合のみ）
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_team_entries_updated_at'
    ) THEN
        ALTER TRIGGER update_team_entries_updated_at ON entries RENAME TO update_entries_updated_at;
    END IF;
END $$;

-- =============================================================================
-- 5. RLSポリシーの削除と再作成
-- =============================================================================

-- team_entriesテーブルのポリシーを削除（テーブルが存在する場合）
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'team_entries') THEN
        DROP POLICY IF EXISTS "Team members can view entries" ON team_entries;
        DROP POLICY IF EXISTS "Users can create own entries" ON team_entries;
        DROP POLICY IF EXISTS "Users can update own entries" ON team_entries;
        DROP POLICY IF EXISTS "Team admins can manage all entries" ON team_entries;
        DROP POLICY IF EXISTS "Team admins can update all entries" ON team_entries;
    END IF;
END $$;

-- entriesテーブルのポリシーを削除（古い名前と新しい名前の両方）
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'entries') THEN
        DROP POLICY IF EXISTS "Team members can view entries" ON entries;
        DROP POLICY IF EXISTS "Users can view own entries" ON entries;
        DROP POLICY IF EXISTS "Users can create own entries" ON entries;
        DROP POLICY IF EXISTS "Users can update own entries" ON entries;
        DROP POLICY IF EXISTS "Users can delete own entries" ON entries;
        DROP POLICY IF EXISTS "Team admins can manage all entries" ON entries;
        DROP POLICY IF EXISTS "Team admins can update all entries" ON entries;
        DROP POLICY IF EXISTS "Team admins can manage all team entries" ON entries;
    END IF;
END $$;

-- 新しいポリシーを作成（個人・チーム共通対応）

-- SELECT: 自分のエントリーまたは所属チームのエントリーを閲覧可能
CREATE POLICY "Users can view own entries" ON entries FOR SELECT 
    USING (
        -- 個人エントリー: 自分のエントリー
        (team_id IS NULL AND user_id = auth.uid())
        OR
        -- チームエントリー: 所属チームのエントリー
        (team_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM team_memberships tm 
            WHERE tm.team_id = entries.team_id 
            AND tm.user_id = auth.uid() 
            AND tm.is_active = true
        ))
    );

-- INSERT: 自分のエントリーを作成可能
CREATE POLICY "Users can create own entries" ON entries FOR INSERT 
    WITH CHECK (
        user_id = auth.uid()
        AND (
            -- 個人エントリー
            team_id IS NULL
            OR
            -- チームエントリー: チームメンバーのみ
            (team_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM team_memberships tm 
                WHERE tm.team_id = entries.team_id 
                AND tm.user_id = auth.uid() 
                AND tm.is_active = true
            ))
        )
    );

-- UPDATE: 自分のエントリーを更新可能
CREATE POLICY "Users can update own entries" ON entries FOR UPDATE 
    USING (
        user_id = auth.uid()
        AND (
            -- 個人エントリー
            team_id IS NULL
            OR
            -- チームエントリー: チームメンバーのみ
            (team_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM team_memberships tm 
                WHERE tm.team_id = entries.team_id 
                AND tm.user_id = auth.uid() 
                AND tm.is_active = true
            ))
        )
    );

-- DELETE: 自分のエントリーを削除可能
CREATE POLICY "Users can delete own entries" ON entries FOR DELETE 
    USING (
        user_id = auth.uid()
        AND (
            -- 個人エントリー
            team_id IS NULL
            OR
            -- チームエントリー: チームメンバーのみ
            (team_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM team_memberships tm 
                WHERE tm.team_id = entries.team_id 
                AND tm.user_id = auth.uid() 
                AND tm.is_active = true
            ))
        )
    );

-- チーム管理者用ポリシー: チームの全エントリーを管理可能
CREATE POLICY "Team admins can manage all team entries" ON entries FOR ALL 
    USING (
        team_id IS NOT NULL 
        AND EXISTS (
            SELECT 1 FROM team_memberships tm 
            WHERE tm.team_id = entries.team_id 
            AND tm.user_id = auth.uid() 
            AND tm.role = 'admin' 
            AND tm.is_active = true
        )
    )
    WITH CHECK (
        team_id IS NOT NULL 
        AND EXISTS (
            SELECT 1 FROM team_memberships tm 
            WHERE tm.team_id = entries.team_id 
            AND tm.user_id = auth.uid() 
            AND tm.role = 'admin' 
            AND tm.is_active = true
        )
    );

-- =============================================================================
-- 6. コメント追加
-- =============================================================================

COMMENT ON TABLE entries IS '大会エントリー情報（個人・チーム共通）';
COMMENT ON COLUMN entries.team_id IS 'チームID（NULL=個人エントリー）';
COMMENT ON COLUMN entries.competition_id IS '大会ID';
COMMENT ON COLUMN entries.user_id IS 'エントリーしたユーザーID';
COMMENT ON COLUMN entries.style_id IS '種目ID';
COMMENT ON COLUMN entries.entry_time IS 'エントリータイム（秒）';
COMMENT ON COLUMN entries.note IS 'メモ・備考';

-- =============================================================================
-- マイグレーション完了
-- =============================================================================

