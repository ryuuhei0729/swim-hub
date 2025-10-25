-- =============================================================================
-- 出欠管理テーブルの拡張（Practice + Competition対応）
-- team_idは外部キーとして持たず、JOINで取得する設計
-- =============================================================================

-- 既存のRLSポリシーを先に削除
DROP POLICY IF EXISTS "Team members can view attendance" ON team_attendance;
DROP POLICY IF EXISTS "Users can manage own attendance" ON team_attendance;
DROP POLICY IF EXISTS "Users can update own attendance" ON team_attendance;
DROP POLICY IF EXISTS "Team admins can manage all attendance" ON team_attendance;
DROP POLICY IF EXISTS "Team admins can update all attendance" ON team_attendance;

-- 既存のteam_attendanceテーブルを拡張
ALTER TABLE team_attendance 
DROP CONSTRAINT IF EXISTS team_attendance_schedule_id_fkey,
DROP CONSTRAINT IF EXISTS team_attendance_schedule_id_user_id_key;

-- 新しいカラムを追加
ALTER TABLE team_attendance 
ADD COLUMN practice_id UUID REFERENCES practices(id) ON DELETE CASCADE,
ADD COLUMN competition_id UUID REFERENCES competitions(id) ON DELETE CASCADE;

-- 既存データの移行
UPDATE team_attendance 
SET practice_id = schedule_id
WHERE schedule_id IS NOT NULL;

-- 古いschedule_idカラムを削除
ALTER TABLE team_attendance DROP COLUMN IF EXISTS schedule_id;

-- ステータスを定義（null = 未回答）
ALTER TABLE team_attendance 
DROP CONSTRAINT IF EXISTS team_attendance_status_check;

ALTER TABLE team_attendance 
ADD CONSTRAINT team_attendance_status_check 
CHECK (status IS NULL OR status IN ('present', 'absent', 'other'));

-- 制約：practice_id または competition_id のどちらか一方は必須
ALTER TABLE team_attendance 
ADD CONSTRAINT team_attendance_event_check 
CHECK (
  (practice_id IS NOT NULL AND competition_id IS NULL) OR 
  (practice_id IS NULL AND competition_id IS NOT NULL)
);

-- ユニーク制約を更新
ALTER TABLE team_attendance 
ADD CONSTRAINT team_attendance_practice_user_unique 
UNIQUE (practice_id, user_id);

ALTER TABLE team_attendance 
ADD CONSTRAINT team_attendance_competition_user_unique 
UNIQUE (competition_id, user_id);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_team_attendance_practice_id ON team_attendance(practice_id);
CREATE INDEX IF NOT EXISTS idx_team_attendance_competition_id ON team_attendance(competition_id);
CREATE INDEX IF NOT EXISTS idx_team_attendance_user_id ON team_attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_team_attendance_status ON team_attendance(status);

-- 新しいRLSポリシー（JOINでteam_idを取得）
CREATE POLICY "Team members can view attendance" ON team_attendance FOR SELECT 
USING (
  (practice_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM practices p
    JOIN team_memberships tm ON tm.team_id = p.team_id
    WHERE p.id = team_attendance.practice_id 
    AND tm.user_id = auth.uid() 
    AND tm.is_active = true
    AND p.team_id IS NOT NULL
  )) OR
  (competition_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM competitions c
    JOIN team_memberships tm ON tm.team_id = c.team_id
    WHERE c.id = team_attendance.competition_id 
    AND tm.user_id = auth.uid() 
    AND tm.is_active = true
    AND c.team_id IS NOT NULL
  ))
);

CREATE POLICY "Users can manage own attendance" ON team_attendance FOR INSERT 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own attendance" ON team_attendance FOR UPDATE 
USING (user_id = auth.uid());

CREATE POLICY "Team admins can manage all attendance" ON team_attendance FOR INSERT 
WITH CHECK (
  (practice_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM practices p
    JOIN team_memberships tm ON tm.team_id = p.team_id
    WHERE p.id = team_attendance.practice_id 
    AND tm.user_id = auth.uid() 
    AND tm.role = 'admin' 
    AND tm.is_active = true
    AND p.team_id IS NOT NULL
  )) OR
  (competition_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM competitions c
    JOIN team_memberships tm ON tm.team_id = c.team_id
    WHERE c.id = team_attendance.competition_id 
    AND tm.user_id = auth.uid() 
    AND tm.role = 'admin' 
    AND tm.is_active = true
    AND c.team_id IS NOT NULL
  ))
);

CREATE POLICY "Team admins can update all attendance" ON team_attendance FOR UPDATE 
USING (
  (practice_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM practices p
    JOIN team_memberships tm ON tm.team_id = p.team_id
    WHERE p.id = team_attendance.practice_id 
    AND tm.user_id = auth.uid() 
    AND tm.role = 'admin' 
    AND tm.is_active = true
    AND p.team_id IS NOT NULL
  )) OR
  (competition_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM competitions c
    JOIN team_memberships tm ON tm.team_id = c.team_id
    WHERE c.id = team_attendance.competition_id 
    AND tm.user_id = auth.uid() 
    AND tm.role = 'admin' 
    AND tm.is_active = true
    AND c.team_id IS NOT NULL
  ))
);

-- 既存のトリガーを削除
DROP TRIGGER IF EXISTS create_attendance_on_team_practice ON practices;
DROP FUNCTION IF EXISTS create_attendance_records_for_team_practice();

-- チーム練習作成時の出欠レコード自動生成
CREATE OR REPLACE FUNCTION create_attendance_for_team_practice()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.team_id IS NOT NULL THEN
    INSERT INTO team_attendance (practice_id, user_id, status)
    SELECT NEW.id, tm.user_id, NULL
    FROM team_memberships tm
    WHERE tm.team_id = NEW.team_id 
    AND tm.is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_attendance_on_team_practice
  AFTER INSERT ON practices
  FOR EACH ROW EXECUTE FUNCTION create_attendance_for_team_practice();

-- チーム大会作成時の出欠レコード自動生成
CREATE OR REPLACE FUNCTION create_attendance_for_team_competition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.team_id IS NOT NULL THEN
    INSERT INTO team_attendance (competition_id, user_id, status)
    SELECT NEW.id, tm.user_id, NULL
    FROM team_memberships tm
    WHERE tm.team_id = NEW.team_id 
    AND tm.is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_attendance_on_team_competition
  AFTER INSERT ON competitions
  FOR EACH ROW EXECUTE FUNCTION create_attendance_for_team_competition();
