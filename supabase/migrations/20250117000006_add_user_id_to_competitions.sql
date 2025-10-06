-- =============================================================================
-- competitionsテーブルにuser_idカラムを追加
-- 水泳選手管理システム（Swim Manager v2）
-- 作成日: 2025年1月17日
-- =============================================================================

-- competitionsテーブルにuser_idカラムを追加（nullableで既存データを保護）
ALTER TABLE competitions 
ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- インデックスを追加
CREATE INDEX idx_competitions_user_id ON competitions(user_id);

-- RLSポリシーを追加（個人の大会へのアクセス制御）
CREATE POLICY "Users can view own competitions" ON competitions FOR SELECT 
    USING (user_id = auth.uid() OR team_id IS NOT NULL);

CREATE POLICY "Users can create own competitions" ON competitions FOR INSERT 
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own competitions" ON competitions FOR UPDATE 
    USING (user_id = auth.uid());

CREATE POLICY "Users can delete own competitions" ON competitions FOR DELETE 
    USING (user_id = auth.uid());

-- チーム大会のアクセス制御（既存のteam_idポリシーと組み合わせ）
-- 注意: 既存のRLSポリシーがある場合は、これらと競合しないように調整が必要
