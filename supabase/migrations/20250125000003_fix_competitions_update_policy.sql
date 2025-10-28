-- =============================================================================
-- competitionsとpracticesテーブルの更新ポリシーを修正
-- チーム管理者がattendance_statusを更新できるようにする
-- =============================================================================

-- competitionsテーブルの既存ポリシーを削除
DROP POLICY IF EXISTS "Users can update own competitions" ON competitions;

-- competitionsテーブルの新しいポリシーを作成
-- 1. 個人の大会: 自分が作成した大会を更新可能
-- 2. チーム大会: チーム管理者が更新可能
CREATE POLICY "Users can update own competitions" ON competitions FOR UPDATE 
USING (
  user_id = auth.uid() 
  OR 
  (team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM team_memberships tm
    WHERE tm.team_id = competitions.team_id
    AND tm.user_id = auth.uid()
    AND tm.role = 'admin'
    AND tm.is_active = true
  ))
);

-- practicesテーブルの既存ポリシーを削除
DROP POLICY IF EXISTS "Users can update own practices" ON practices;

-- practicesテーブルの新しいポリシーを作成
-- 1. 個人の練習: 自分が作成した練習を更新可能
-- 2. チーム練習: チーム管理者が更新可能
CREATE POLICY "Users can update own practices" ON practices FOR UPDATE 
USING (
  user_id = auth.uid() 
  OR 
  (team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM team_memberships tm
    WHERE tm.team_id = practices.team_id
    AND tm.user_id = auth.uid()
    AND tm.role = 'admin'
    AND tm.is_active = true
  ))
);

