-- =============================================================================
-- チームスケジュール用RLSポリシー修正
-- practicesとcompetitionsテーブルでチームメンバーがチーム用データを閲覧可能にする
-- =============================================================================

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Users can view own practices" ON practices;
DROP POLICY IF EXISTS "Users can view own competitions" ON competitions;

-- practicesテーブルの新しいポリシー
-- 1. 個人の練習（team_id IS NULL）は本人のみ閲覧可能
-- 2. チーム練習（team_id IS NOT NULL）はチームメンバーが閲覧可能
CREATE POLICY "Users can view practices" ON practices FOR SELECT 
    USING (
        -- 個人練習の場合：本人のみ
        (team_id IS NULL AND auth.uid() = user_id) OR
        -- チーム練習の場合：チームメンバー
        (team_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM team_memberships tm 
            WHERE tm.team_id = practices.team_id 
            AND tm.user_id = auth.uid() 
            AND tm.is_active = true
        ))
    );

-- competitionsテーブルの新しいポリシー
-- 1. 個人の大会（team_id IS NULL）は全員閲覧可能（既存の動作を維持）
-- 2. チーム大会（team_id IS NOT NULL）はチームメンバーが閲覧可能
CREATE POLICY "Users can view competitions" ON competitions FOR SELECT 
    USING (
        -- 個人大会の場合：全員閲覧可能
        team_id IS NULL OR
        -- チーム大会の場合：チームメンバー
        (team_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM team_memberships tm 
            WHERE tm.team_id = competitions.team_id 
            AND tm.user_id = auth.uid() 
            AND tm.is_active = true
        ))
    );

-- =============================================================================
-- マイグレーション完了
-- =============================================================================
