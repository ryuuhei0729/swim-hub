-- =============================================================================
-- entriesテーブルのUPDATEポリシーを修正
-- team_idがある場合も正しく更新できるようにする
-- =============================================================================

-- 既存のUPDATEポリシーを削除
DROP POLICY IF EXISTS "Users can update own entries" ON entries;

-- 新しいUPDATEポリシーを作成（WITH CHECKを追加）
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
)
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
