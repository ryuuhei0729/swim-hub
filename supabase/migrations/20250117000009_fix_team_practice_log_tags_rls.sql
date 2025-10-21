-- チーム練習ログのタグ作成を可能にするRLSポリシー

-- ============================================================================
-- practice_logs テーブルのRLSポリシーをチーム対応に更新
-- ============================================================================

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Users can insert own practice_logs" ON practice_logs;
DROP POLICY IF EXISTS "Users can delete own practice_logs" ON practice_logs;
DROP POLICY IF EXISTS "Users can update own practice_logs" ON practice_logs;
DROP POLICY IF EXISTS "Users can view own practice_logs" ON practice_logs;

-- 新しいポリシーを作成（個人とチーム両方に対応）
CREATE POLICY "Users can insert practice_logs for own or team practices" ON practice_logs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM practices p
    WHERE p.id = practice_logs.practice_id
    AND (
      -- 個人の練習記録
      p.user_id = auth.uid()
      OR
      -- チームの練習記録（チームメンバーの場合）
      EXISTS (
        SELECT 1
        FROM team_memberships tm
        WHERE tm.team_id = p.team_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
      )
    )
  )
);

CREATE POLICY "Users can delete practice_logs for own or team practices" ON practice_logs
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM practices p
    WHERE p.id = practice_logs.practice_id
    AND (
      -- 個人の練習記録
      p.user_id = auth.uid()
      OR
      -- チームの練習記録（チームメンバーの場合）
      EXISTS (
        SELECT 1
        FROM team_memberships tm
        WHERE tm.team_id = p.team_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
      )
    )
  )
);

CREATE POLICY "Users can update practice_logs for own or team practices" ON practice_logs
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM practices p
    WHERE p.id = practice_logs.practice_id
    AND (
      -- 個人の練習記録
      p.user_id = auth.uid()
      OR
      -- チームの練習記録（チームメンバーの場合）
      EXISTS (
        SELECT 1
        FROM team_memberships tm
        WHERE tm.team_id = p.team_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
      )
    )
  )
);

CREATE POLICY "Users can view practice_logs for own or team practices" ON practice_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM practices p
    WHERE p.id = practice_logs.practice_id
    AND (
      -- 個人の練習記録
      p.user_id = auth.uid()
      OR
      -- チームの練習記録（チームメンバーの場合）
      EXISTS (
        SELECT 1
        FROM team_memberships tm
        WHERE tm.team_id = p.team_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
      )
    )
  )
);

-- ============================================================================
-- practice_times テーブルのRLSポリシーをチーム対応に更新
-- ============================================================================

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Users can insert own practice_times" ON practice_times;
DROP POLICY IF EXISTS "Users can delete own practice_times" ON practice_times;
DROP POLICY IF EXISTS "Users can update own practice_times" ON practice_times;
DROP POLICY IF EXISTS "Users can view own practice_times" ON practice_times;

-- 新しいポリシーを作成（個人とチーム両方に対応）
CREATE POLICY "Users can insert practice_times for own or team practices" ON practice_times
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM practice_logs pl
    JOIN practices p ON p.id = pl.practice_id
    WHERE pl.id = practice_times.practice_log_id
    AND (
      -- 個人の練習記録
      p.user_id = auth.uid()
      OR
      -- チームの練習記録（チームメンバーの場合）
      EXISTS (
        SELECT 1
        FROM team_memberships tm
        WHERE tm.team_id = p.team_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
      )
    )
  )
);

CREATE POLICY "Users can delete practice_times for own or team practices" ON practice_times
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM practice_logs pl
    JOIN practices p ON p.id = pl.practice_id
    WHERE pl.id = practice_times.practice_log_id
    AND (
      -- 個人の練習記録
      p.user_id = auth.uid()
      OR
      -- チームの練習記録（チームメンバーの場合）
      EXISTS (
        SELECT 1
        FROM team_memberships tm
        WHERE tm.team_id = p.team_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
      )
    )
  )
);

CREATE POLICY "Users can update practice_times for own or team practices" ON practice_times
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM practice_logs pl
    JOIN practices p ON p.id = pl.practice_id
    WHERE pl.id = practice_times.practice_log_id
    AND (
      -- 個人の練習記録
      p.user_id = auth.uid()
      OR
      -- チームの練習記録（チームメンバーの場合）
      EXISTS (
        SELECT 1
        FROM team_memberships tm
        WHERE tm.team_id = p.team_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
      )
    )
  )
);

CREATE POLICY "Users can view practice_times for own or team practices" ON practice_times
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM practice_logs pl
    JOIN practices p ON p.id = pl.practice_id
    WHERE pl.id = practice_times.practice_log_id
    AND (
      -- 個人の練習記録
      p.user_id = auth.uid()
      OR
      -- チームの練習記録（チームメンバーの場合）
      EXISTS (
        SELECT 1
        FROM team_memberships tm
        WHERE tm.team_id = p.team_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
      )
    )
  )
);

-- ============================================================================
-- practice_log_tags テーブルのRLSポリシーをチーム対応に更新
-- ============================================================================

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Users can insert own practice_log_tags" ON practice_log_tags;

-- 新しいポリシーを作成（個人とチーム両方に対応）
CREATE POLICY "Users can insert practice_log_tags for own or team practices" ON practice_log_tags
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM practice_logs pl
    JOIN practices p ON p.id = pl.practice_id
    WHERE pl.id = practice_log_tags.practice_log_id
    AND (
      -- 個人の練習記録
      p.user_id = auth.uid()
      OR
      -- チームの練習記録（チームメンバーの場合）
      EXISTS (
        SELECT 1
        FROM team_memberships tm
        WHERE tm.team_id = p.team_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
      )
    )
  )
);

-- 既存の削除ポリシーも更新
DROP POLICY IF EXISTS "Users can delete own practice_log_tags" ON practice_log_tags;

CREATE POLICY "Users can delete practice_log_tags for own or team practices" ON practice_log_tags
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM practice_logs pl
    JOIN practices p ON p.id = pl.practice_id
    WHERE pl.id = practice_log_tags.practice_log_id
    AND (
      -- 個人の練習記録
      p.user_id = auth.uid()
      OR
      -- チームの練習記録（チームメンバーの場合）
      EXISTS (
        SELECT 1
        FROM team_memberships tm
        WHERE tm.team_id = p.team_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
      )
    )
  )
);

-- 既存の更新ポリシーも更新
DROP POLICY IF EXISTS "Users can update own practice_log_tags" ON practice_log_tags;

CREATE POLICY "Users can update practice_log_tags for own or team practices" ON practice_log_tags
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM practice_logs pl
    JOIN practices p ON p.id = pl.practice_id
    WHERE pl.id = practice_log_tags.practice_log_id
    AND (
      -- 個人の練習記録
      p.user_id = auth.uid()
      OR
      -- チームの練習記録（チームメンバーの場合）
      EXISTS (
        SELECT 1
        FROM team_memberships tm
        WHERE tm.team_id = p.team_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
      )
    )
  )
);

-- 既存の選択ポリシーも更新
DROP POLICY IF EXISTS "Users can view own practice_log_tags" ON practice_log_tags;

CREATE POLICY "Users can view practice_log_tags for own or team practices" ON practice_log_tags
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM practice_logs pl
    JOIN practices p ON p.id = pl.practice_id
    WHERE pl.id = practice_log_tags.practice_log_id
    AND (
      -- 個人の練習記録
      p.user_id = auth.uid()
      OR
      -- チームの練習記録（チームメンバーの場合）
      EXISTS (
        SELECT 1
        FROM team_memberships tm
        WHERE tm.team_id = p.team_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
      )
    )
  )
);
