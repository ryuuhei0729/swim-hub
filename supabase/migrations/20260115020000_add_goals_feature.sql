-- 目標管理機能のマイグレーション
-- goals, milestones, milestone_achievementsテーブルを作成

-- goalsテーブル（大会目標）
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  style_id INTEGER NOT NULL REFERENCES styles(id),
  target_time DECIMAL(10,2) NOT NULL, -- 目標タイム（秒）
  start_time DECIMAL(10,2) NULL, -- 初期タイム（秒）。NULL可（ベストタイムがない場合）
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'cancelled')),
  achieved_at TIMESTAMP WITH TIME ZONE NULL, -- 達成日時
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_user_competition_style UNIQUE (user_id, competition_id, style_id)
);

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_competition_id ON goals(competition_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);

-- milestonesテーブル（マイルストーン）
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL, -- マイルストーン名
  type TEXT NOT NULL CHECK (type IN ('time', 'reps_time', 'set')),
  params JSONB NOT NULL, -- 型別パラメータ
  deadline DATE NULL, -- 期限日（NULL可）
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'achieved', 'expired')),
  achieved_at TIMESTAMP WITH TIME ZONE NULL, -- 達成日時
  reflection_done BOOLEAN NOT NULL DEFAULT FALSE, -- 期限切れ内省モーダル表示済みフラグ
  reflection_note TEXT NULL, -- 内省メモ（期限切れ時の振り返り）
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_goal_id ON milestones(goal_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestones_deadline ON milestones(deadline);

-- milestone_achievementsテーブル（達成記録）
CREATE TABLE IF NOT EXISTS milestone_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  practice_log_id UUID NULL REFERENCES practice_logs(id) ON DELETE SET NULL,
  record_id UUID NULL REFERENCES records(id) ON DELETE SET NULL,
  achieved_value JSONB NOT NULL, -- 達成時の実績値（type別に異なる）
  achieved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT check_source CHECK (
    (practice_log_id IS NOT NULL AND record_id IS NULL) OR
    (practice_log_id IS NULL AND record_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_milestone_achievements_milestone_id ON milestone_achievements(milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_achievements_practice_log_id ON milestone_achievements(practice_log_id);
CREATE INDEX IF NOT EXISTS idx_milestone_achievements_record_id ON milestone_achievements(record_id);

-- updated_at自動更新トリガー関数（既存のものがあればスキップ）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- goalsテーブルのupdated_atトリガー
DROP TRIGGER IF EXISTS update_goals_updated_at ON goals;
CREATE TRIGGER update_goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- milestonesテーブルのupdated_atトリガー
DROP TRIGGER IF EXISTS update_milestones_updated_at ON milestones;
CREATE TRIGGER update_milestones_updated_at
  BEFORE UPDATE ON milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS（Row Level Security）設定

-- goalsテーブル
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own goals" ON goals;
CREATE POLICY "Users can view their own goals"
  ON goals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own goals" ON goals;
CREATE POLICY "Users can create their own goals"
  ON goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own goals" ON goals;
CREATE POLICY "Users can update their own goals"
  ON goals FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own goals" ON goals;
CREATE POLICY "Users can delete their own goals"
  ON goals FOR DELETE
  USING (auth.uid() = user_id);

-- milestonesテーブル
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view milestones of their goals" ON milestones;
CREATE POLICY "Users can view milestones of their goals"
  ON milestones FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM goals
      WHERE goals.id = milestones.goal_id
      AND goals.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create milestones for their goals" ON milestones;
CREATE POLICY "Users can create milestones for their goals"
  ON milestones FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM goals
      WHERE goals.id = milestones.goal_id
      AND goals.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update milestones of their goals" ON milestones;
CREATE POLICY "Users can update milestones of their goals"
  ON milestones FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM goals
      WHERE goals.id = milestones.goal_id
      AND goals.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete milestones of their goals" ON milestones;
CREATE POLICY "Users can delete milestones of their goals"
  ON milestones FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM goals
      WHERE goals.id = milestones.goal_id
      AND goals.user_id = auth.uid()
    )
  );

-- milestone_achievementsテーブル
ALTER TABLE milestone_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view achievements of their milestones" ON milestone_achievements;
CREATE POLICY "Users can view achievements of their milestones"
  ON milestone_achievements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM milestones
      JOIN goals ON goals.id = milestones.goal_id
      WHERE milestones.id = milestone_achievements.milestone_id
      AND goals.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create their own achievements" ON milestone_achievements;
CREATE POLICY "Users can create their own achievements"
  ON milestone_achievements FOR INSERT
  WITH CHECK (
    -- マイルストーンの所有者のみが達成記録を作成できる
    EXISTS (
      SELECT 1 FROM milestones
      JOIN goals ON goals.id = milestones.goal_id
      WHERE milestones.id = milestone_achievements.milestone_id
      AND goals.user_id = auth.uid()
    )
    AND (
      -- practice_log_idが指定されている場合、それも所有者のものである必要がある
      practice_log_id IS NULL OR
      EXISTS (
        SELECT 1 FROM practice_logs
        WHERE practice_logs.id = milestone_achievements.practice_log_id
        AND practice_logs.user_id = auth.uid()
      )
    )
    AND (
      -- record_idが指定されている場合、それも所有者のものである必要がある
      record_id IS NULL OR
      EXISTS (
        SELECT 1 FROM records
        WHERE records.id = milestone_achievements.record_id
        AND records.user_id = auth.uid()
      )
    )
  );
