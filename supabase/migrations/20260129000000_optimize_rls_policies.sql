-- RLSポリシーのパフォーマンス最適化
-- 1. auth_rls_initplan: auth.uid() を (select auth.uid()) に変更
-- 2. multiple_permissive_policies: 複数のpermissiveポリシーを1つに統合

-- ============================================
-- 1. goals テーブル: auth.uid() → (select auth.uid())
-- ============================================

DROP POLICY IF EXISTS "Users can view their own goals" ON goals;
CREATE POLICY "Users can view their own goals"
  ON goals FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own goals" ON goals;
CREATE POLICY "Users can create their own goals"
  ON goals FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own goals" ON goals;
CREATE POLICY "Users can update their own goals"
  ON goals FOR UPDATE
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own goals" ON goals;
CREATE POLICY "Users can delete their own goals"
  ON goals FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ============================================
-- 2. milestones テーブル: auth.uid() → (select auth.uid())
-- ============================================

DROP POLICY IF EXISTS "Users can view milestones of their goals" ON milestones;
CREATE POLICY "Users can view milestones of their goals"
  ON milestones FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM goals
      WHERE goals.id = milestones.goal_id
      AND goals.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create milestones for their goals" ON milestones;
CREATE POLICY "Users can create milestones for their goals"
  ON milestones FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM goals
      WHERE goals.id = milestones.goal_id
      AND goals.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update milestones of their goals" ON milestones;
CREATE POLICY "Users can update milestones of their goals"
  ON milestones FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM goals
      WHERE goals.id = milestones.goal_id
      AND goals.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM goals
      WHERE goals.id = milestones.goal_id
      AND goals.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete milestones of their goals" ON milestones;
CREATE POLICY "Users can delete milestones of their goals"
  ON milestones FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM goals
      WHERE goals.id = milestones.goal_id
      AND goals.user_id = (select auth.uid())
    )
  );

-- ============================================
-- 3. milestone_achievements テーブル: auth.uid() → (select auth.uid())
-- ============================================

DROP POLICY IF EXISTS "Users can view achievements of their milestones" ON milestone_achievements;
CREATE POLICY "Users can view achievements of their milestones"
  ON milestone_achievements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM milestones
      JOIN goals ON goals.id = milestones.goal_id
      WHERE milestones.id = milestone_achievements.milestone_id
      AND goals.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create their own achievements" ON milestone_achievements;
CREATE POLICY "Users can create their own achievements"
  ON milestone_achievements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM milestones
      JOIN goals ON goals.id = milestones.goal_id
      WHERE milestones.id = milestone_achievements.milestone_id
      AND goals.user_id = (select auth.uid())
    )
    AND (
      practice_log_id IS NULL OR
      EXISTS (
        SELECT 1 FROM practice_logs
        WHERE practice_logs.id = milestone_achievements.practice_log_id
        AND practice_logs.user_id = (select auth.uid())
      )
    )
    AND (
      record_id IS NULL OR
      EXISTS (
        SELECT 1 FROM records
        WHERE records.id = milestone_achievements.record_id
        AND records.user_id = (select auth.uid())
      )
    )
  );

-- ============================================
-- 4. records テーブル: 複数ポリシーを1つに統合
-- ============================================

-- SELECT: 3つのポリシーを1つに統合
DROP POLICY IF EXISTS "Users can view own records" ON records;
DROP POLICY IF EXISTS "Team members can view teammates' personal records" ON records;
DROP POLICY IF EXISTS "Team members can view team records" ON records;
DROP POLICY IF EXISTS "Records select policy" ON records;

CREATE POLICY "Records select policy" ON records
FOR SELECT USING (
  -- 自分のレコード
  (select auth.uid()) = user_id
  OR
  -- チームメンバーの個人記録（team_id IS NULL）
  (
    team_id IS NULL
    AND public.shares_active_team(records.user_id, (select auth.uid()))
  )
  OR
  -- チーム記録
  (
    team_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.team_memberships tm
      WHERE tm.team_id = records.team_id
      AND tm.user_id = (select auth.uid())
      AND tm.is_active = true
    )
  )
);

-- INSERT: 2つのポリシーを1つに統合
DROP POLICY IF EXISTS "Users can insert own records" ON records;
DROP POLICY IF EXISTS "Team admins can insert team member records" ON records;
DROP POLICY IF EXISTS "Records insert policy" ON records;

CREATE POLICY "Records insert policy" ON records
FOR INSERT WITH CHECK (
  -- 自分のレコード
  (select auth.uid()) = user_id
  OR
  -- チーム管理者による代理INSERT
  (
    team_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.team_memberships tm
      WHERE tm.team_id = records.team_id
      AND tm.user_id = (select auth.uid())
      AND tm.role = 'admin'
      AND tm.is_active = true
    )
    AND EXISTS (
      SELECT 1 FROM public.team_memberships tm
      WHERE tm.team_id = records.team_id
      AND tm.user_id = records.user_id
      AND tm.is_active = true
    )
  )
);

-- UPDATE: 2つのポリシーを1つに統合
DROP POLICY IF EXISTS "Users can update own records" ON records;
DROP POLICY IF EXISTS "Team admins can update team member records" ON records;
DROP POLICY IF EXISTS "Records update policy" ON records;

CREATE POLICY "Records update policy" ON records
FOR UPDATE USING (
  -- 自分のレコード
  (select auth.uid()) = user_id
  OR
  -- チーム管理者による代理UPDATE
  (
    team_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.team_memberships tm
      WHERE tm.team_id = records.team_id
      AND tm.user_id = (select auth.uid())
      AND tm.role = 'admin'
      AND tm.is_active = true
    )
    AND EXISTS (
      SELECT 1 FROM public.team_memberships tm
      WHERE tm.team_id = records.team_id
      AND tm.user_id = records.user_id
      AND tm.is_active = true
    )
  )
);

-- DELETE: 2つのポリシーを1つに統合
DROP POLICY IF EXISTS "Users can delete own records" ON records;
DROP POLICY IF EXISTS "Team admins can delete team member records" ON records;
DROP POLICY IF EXISTS "Records delete policy" ON records;

CREATE POLICY "Records delete policy" ON records
FOR DELETE USING (
  -- 自分のレコード
  (select auth.uid()) = user_id
  OR
  -- チーム管理者による代理DELETE
  (
    team_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.team_memberships tm
      WHERE tm.team_id = records.team_id
      AND tm.user_id = (select auth.uid())
      AND tm.role = 'admin'
      AND tm.is_active = true
    )
    AND EXISTS (
      SELECT 1 FROM public.team_memberships tm
      WHERE tm.team_id = records.team_id
      AND tm.user_id = records.user_id
      AND tm.is_active = true
    )
  )
);

-- ============================================
-- 5. split_times テーブル: 複数ポリシーを1つに統合
-- ============================================

-- SELECT: 2つのポリシーを1つに統合
DROP POLICY IF EXISTS "Users can view own split_times" ON split_times;
DROP POLICY IF EXISTS "Team members can view team split_times" ON split_times;
DROP POLICY IF EXISTS "Split times select policy" ON split_times;

CREATE POLICY "Split times select policy" ON split_times
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.records r
    WHERE r.id = split_times.record_id
    AND (
      -- 自分のレコード
      r.user_id = (select auth.uid())
      OR
      -- チーム記録
      (
        r.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.team_memberships tm
          WHERE tm.team_id = r.team_id
          AND tm.user_id = (select auth.uid())
          AND tm.is_active = true
        )
      )
    )
  )
);

-- INSERT: 2つのポリシーを1つに統合
DROP POLICY IF EXISTS "Users can insert own split_times" ON split_times;
DROP POLICY IF EXISTS "Team admins can insert team member split_times" ON split_times;
DROP POLICY IF EXISTS "Split times insert policy" ON split_times;

CREATE POLICY "Split times insert policy" ON split_times
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.records r
    WHERE r.id = split_times.record_id
    AND (
      -- 自分のレコード
      r.user_id = (select auth.uid())
      OR
      -- チーム管理者による代理INSERT
      (
        r.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.team_memberships tm
          WHERE tm.team_id = r.team_id
          AND tm.user_id = (select auth.uid())
          AND tm.role = 'admin'
          AND tm.is_active = true
        )
      )
    )
  )
);

-- UPDATE: 2つのポリシーを1つに統合
DROP POLICY IF EXISTS "Users can update own split_times" ON split_times;
DROP POLICY IF EXISTS "Team admins can update team member split_times" ON split_times;
DROP POLICY IF EXISTS "Split times update policy" ON split_times;

CREATE POLICY "Split times update policy" ON split_times
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.records r
    WHERE r.id = split_times.record_id
    AND (
      -- 自分のレコード
      r.user_id = (select auth.uid())
      OR
      -- チーム管理者による代理UPDATE
      (
        r.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.team_memberships tm
          WHERE tm.team_id = r.team_id
          AND tm.user_id = (select auth.uid())
          AND tm.role = 'admin'
          AND tm.is_active = true
        )
      )
    )
  )
);

-- DELETE: 2つのポリシーを1つに統合
DROP POLICY IF EXISTS "Users can delete own split_times" ON split_times;
DROP POLICY IF EXISTS "Team admins can delete team member split_times" ON split_times;
DROP POLICY IF EXISTS "Split times delete policy" ON split_times;

CREATE POLICY "Split times delete policy" ON split_times
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.records r
    WHERE r.id = split_times.record_id
    AND (
      -- 自分のレコード
      r.user_id = (select auth.uid())
      OR
      -- チーム管理者による代理DELETE
      (
        r.team_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.team_memberships tm
          WHERE tm.team_id = r.team_id
          AND tm.user_id = (select auth.uid())
          AND tm.role = 'admin'
          AND tm.is_active = true
        )
      )
    )
  )
);
