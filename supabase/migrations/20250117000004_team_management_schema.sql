-- =============================================================================
-- チーム管理機能スキーママイグレーション
-- 水泳選手管理システム（Swim Manager v2）
-- 作成日: 2025年1月17日
-- =============================================================================

-- =============================================================================
-- 1. チーム関連テーブルの作成
-- =============================================================================

-- チームテーブル
CREATE TABLE teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  invite_code TEXT UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- チームメンバーシップテーブル（UserとTeamの多対多関係）
CREATE TABLE team_memberships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  joined_at DATE DEFAULT CURRENT_DATE,
  left_at DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- チーム内グループテーブル（チーム内での分類用）
CREATE TABLE team_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, name)
);

-- グループ割り当てテーブル（メンバーのグループ割り当て）
CREATE TABLE group_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_group_id UUID NOT NULL REFERENCES team_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_group_id, user_id)
);

-- =============================================================================
-- 2. お知らせ関連テーブルの作成
-- =============================================================================

-- お知らせテーブル
CREATE TABLE announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- 3. 出欠管理関連テーブルの作成
-- =============================================================================

-- 出欠管理テーブル（practicesテーブルを参照）
CREATE TABLE team_attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('present', 'absent', 'other')),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(schedule_id, user_id)
);

-- =============================================================================
-- 3. チーム練習・記録関連テーブルの作成
-- =============================================================================

-- チーム練習記録テーブル（既存のpracticesテーブルを拡張）
ALTER TABLE practices 
ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE CASCADE;

-- チーム大会記録テーブル（既存のcompetitionsテーブルを拡張）
ALTER TABLE competitions 
ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE CASCADE;

-- チーム記録テーブル（既存のrecordsテーブルを拡張）
ALTER TABLE records 
ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE CASCADE;

-- 大会テーブルにエントリー状態を追加
ALTER TABLE competitions 
ADD COLUMN entry_status TEXT DEFAULT 'upcoming' CHECK (entry_status IN ('upcoming', 'open', 'closed'));

-- =============================================================================
-- 4. エントリー管理関連テーブルの作成
-- =============================================================================

-- 大会エントリーテーブル
CREATE TABLE team_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  style_id INTEGER NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
  entry_time DECIMAL(10,2), -- エントリータイム
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(competition_id, user_id, style_id)
);

-- =============================================================================
-- 5. インデックスの作成
-- =============================================================================

-- Teams table indexes
CREATE INDEX idx_teams_created_by ON teams(created_by);
CREATE INDEX idx_teams_invite_code ON teams(invite_code);
CREATE INDEX idx_teams_created_at ON teams(created_at);

-- Team memberships table indexes
CREATE INDEX idx_team_memberships_team_id ON team_memberships(team_id);
CREATE INDEX idx_team_memberships_user_id ON team_memberships(user_id);
CREATE INDEX idx_team_memberships_role ON team_memberships(role);
CREATE INDEX idx_team_memberships_is_active ON team_memberships(is_active);
CREATE INDEX idx_team_memberships_joined_at ON team_memberships(joined_at);

-- Team groups table indexes
CREATE INDEX idx_team_groups_team_id ON team_groups(team_id);
CREATE INDEX idx_team_groups_created_by ON team_groups(created_by);

-- Group assignments table indexes
CREATE INDEX idx_group_assignments_team_group_id ON group_assignments(team_group_id);
CREATE INDEX idx_group_assignments_user_id ON group_assignments(user_id);

-- Announcements table indexes
CREATE INDEX idx_announcements_team_id ON announcements(team_id);
CREATE INDEX idx_announcements_created_by ON announcements(created_by);
CREATE INDEX idx_announcements_is_published ON announcements(is_published);
CREATE INDEX idx_announcements_published_at ON announcements(published_at);


-- Team attendance table indexes
CREATE INDEX idx_team_attendance_schedule_id ON team_attendance(schedule_id);
CREATE INDEX idx_team_attendance_user_id ON team_attendance(user_id);
CREATE INDEX idx_team_attendance_status ON team_attendance(status);

-- 既存テーブルの拡張カラム用インデックス
CREATE INDEX idx_practices_team_id ON practices(team_id);
CREATE INDEX idx_competitions_team_id ON competitions(team_id);
CREATE INDEX idx_records_team_id ON records(team_id);

-- Team entries table indexes
CREATE INDEX idx_team_entries_team_id ON team_entries(team_id);
CREATE INDEX idx_team_entries_competition_id ON team_entries(competition_id);
CREATE INDEX idx_team_entries_user_id ON team_entries(user_id);
CREATE INDEX idx_team_entries_style_id ON team_entries(style_id);

-- =============================================================================
-- 6. Row Level Security (RLS) の設定
-- =============================================================================

-- 全テーブルでRLSを有効化
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_entries ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 7. RLSポリシーの設定
-- =============================================================================

-- Teams table policies
CREATE POLICY "Team members can view team" ON teams FOR SELECT 
    USING (EXISTS (
        SELECT 1 FROM team_memberships tm 
        WHERE tm.team_id = teams.id AND tm.user_id = auth.uid() AND tm.is_active = true
    ));

CREATE POLICY "Authenticated users can create teams" ON teams FOR INSERT 
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Team admins can update team" ON teams FOR UPDATE 
    USING (EXISTS (
        SELECT 1 FROM team_memberships tm 
        WHERE tm.team_id = teams.id AND tm.user_id = auth.uid() 
        AND tm.role = 'admin' AND tm.is_active = true
    ));

CREATE POLICY "Team admins can delete team" ON teams FOR DELETE 
    USING (EXISTS (
        SELECT 1 FROM team_memberships tm 
        WHERE tm.team_id = teams.id AND tm.user_id = auth.uid() 
        AND tm.role = 'admin' AND tm.is_active = true
    ));

-- Team memberships table policies
CREATE POLICY "Team members can view memberships" ON team_memberships FOR SELECT 
    USING (EXISTS (
        SELECT 1 FROM team_memberships tm 
        WHERE tm.team_id = team_memberships.team_id AND tm.user_id = auth.uid() AND tm.is_active = true
    ));

CREATE POLICY "Team admins can manage memberships" ON team_memberships FOR INSERT 
    WITH CHECK (EXISTS (
        SELECT 1 FROM team_memberships tm 
        WHERE tm.team_id = team_memberships.team_id AND tm.user_id = auth.uid() 
        AND tm.role = 'admin' AND tm.is_active = true
    ));

CREATE POLICY "Team admins can update memberships" ON team_memberships FOR UPDATE 
    USING (EXISTS (
        SELECT 1 FROM team_memberships tm 
        WHERE tm.team_id = team_memberships.team_id AND tm.user_id = auth.uid() 
        AND tm.role = 'admin' AND tm.is_active = true
    ));

CREATE POLICY "Users can leave teams" ON team_memberships FOR UPDATE 
    USING (user_id = auth.uid());

-- Team groups table policies
CREATE POLICY "Team members can view groups" ON team_groups FOR SELECT 
    USING (EXISTS (
        SELECT 1 FROM team_memberships tm 
        WHERE tm.team_id = team_groups.team_id AND tm.user_id = auth.uid() AND tm.is_active = true
    ));

CREATE POLICY "Team admins can manage groups" ON team_groups FOR INSERT 
    WITH CHECK (EXISTS (
        SELECT 1 FROM team_memberships tm 
        WHERE tm.team_id = team_groups.team_id AND tm.user_id = auth.uid() 
        AND tm.role = 'admin' AND tm.is_active = true
    ));

CREATE POLICY "Team admins can update groups" ON team_groups FOR UPDATE 
    USING (EXISTS (
        SELECT 1 FROM team_memberships tm 
        WHERE tm.team_id = team_groups.team_id AND tm.user_id = auth.uid() 
        AND tm.role = 'admin' AND tm.is_active = true
    ));

CREATE POLICY "Team admins can delete groups" ON team_groups FOR DELETE 
    USING (EXISTS (
        SELECT 1 FROM team_memberships tm 
        WHERE tm.team_id = team_groups.team_id AND tm.user_id = auth.uid() 
        AND tm.role = 'admin' AND tm.is_active = true
    ));

-- Group assignments table policies
CREATE POLICY "Team members can view group assignments" ON group_assignments FOR SELECT 
    USING (EXISTS (
        SELECT 1 FROM team_groups tg
        JOIN team_memberships tm ON tm.team_id = tg.team_id
        WHERE tg.id = group_assignments.team_group_id AND tm.user_id = auth.uid() AND tm.is_active = true
    ));

CREATE POLICY "Team admins can manage group assignments" ON group_assignments FOR INSERT 
    WITH CHECK (EXISTS (
        SELECT 1 FROM team_groups tg
        JOIN team_memberships tm ON tm.team_id = tg.team_id
        WHERE tg.id = group_assignments.team_group_id AND tm.user_id = auth.uid() 
        AND tm.role = 'admin' AND tm.is_active = true
    ));

CREATE POLICY "Team admins can update group assignments" ON group_assignments FOR UPDATE 
    USING (EXISTS (
        SELECT 1 FROM team_groups tg
        JOIN team_memberships tm ON tm.team_id = tg.team_id
        WHERE tg.id = group_assignments.team_group_id AND tm.user_id = auth.uid() 
        AND tm.role = 'admin' AND tm.is_active = true
    ));

CREATE POLICY "Team admins can delete group assignments" ON group_assignments FOR DELETE 
    USING (EXISTS (
        SELECT 1 FROM team_groups tg
        JOIN team_memberships tm ON tm.team_id = tg.team_id
        WHERE tg.id = group_assignments.team_group_id AND tm.user_id = auth.uid() 
        AND tm.role = 'admin' AND tm.is_active = true
    ));

-- Announcements table policies
CREATE POLICY "Team members can view announcements" ON announcements FOR SELECT 
    USING (EXISTS (
        SELECT 1 FROM team_memberships tm 
        WHERE tm.team_id = announcements.team_id AND tm.user_id = auth.uid() AND tm.is_active = true
    ));

CREATE POLICY "Team admins can create announcements" ON announcements FOR INSERT 
    WITH CHECK (EXISTS (
        SELECT 1 FROM team_memberships tm 
        WHERE tm.team_id = announcements.team_id AND tm.user_id = auth.uid() 
        AND tm.role = 'admin' AND tm.is_active = true
    ));

CREATE POLICY "Team admins can update announcements" ON announcements FOR UPDATE 
    USING (EXISTS (
        SELECT 1 FROM team_memberships tm 
        WHERE tm.team_id = announcements.team_id AND tm.user_id = auth.uid() 
        AND tm.role = 'admin' AND tm.is_active = true
    ));

CREATE POLICY "Team admins can delete announcements" ON announcements FOR DELETE 
    USING (EXISTS (
        SELECT 1 FROM team_memberships tm 
        WHERE tm.team_id = announcements.team_id AND tm.user_id = auth.uid() 
        AND tm.role = 'admin' AND tm.is_active = true
    ));


-- Team attendance table policies
CREATE POLICY "Team members can view attendance" ON team_attendance FOR SELECT 
    USING (EXISTS (
        SELECT 1 FROM practices p
        JOIN team_memberships tm ON tm.team_id = p.team_id
        WHERE p.id = team_attendance.schedule_id AND tm.user_id = auth.uid() AND tm.is_active = true
    ));

CREATE POLICY "Users can manage own attendance" ON team_attendance FOR INSERT 
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own attendance" ON team_attendance FOR UPDATE 
    USING (user_id = auth.uid());

CREATE POLICY "Team admins can manage all attendance" ON team_attendance FOR INSERT 
    WITH CHECK (EXISTS (
        SELECT 1 FROM practices p
        JOIN team_memberships tm ON tm.team_id = p.team_id
        WHERE p.id = team_attendance.schedule_id AND tm.user_id = auth.uid() 
        AND tm.role = 'admin' AND tm.is_active = true
    ));

CREATE POLICY "Team admins can update all attendance" ON team_attendance FOR UPDATE 
    USING (EXISTS (
        SELECT 1 FROM practices p
        JOIN team_memberships tm ON tm.team_id = p.team_id
        WHERE p.id = team_attendance.schedule_id AND tm.user_id = auth.uid() 
        AND tm.role = 'admin' AND tm.is_active = true
    ));

-- Team entries table policies
CREATE POLICY "Team members can view entries" ON team_entries FOR SELECT 
    USING (EXISTS (
        SELECT 1 FROM team_memberships tm 
        WHERE tm.team_id = team_entries.team_id AND tm.user_id = auth.uid() AND tm.is_active = true
    ));

CREATE POLICY "Users can create own entries" ON team_entries FOR INSERT 
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own entries" ON team_entries FOR UPDATE 
    USING (user_id = auth.uid());

CREATE POLICY "Team admins can manage all entries" ON team_entries FOR INSERT 
    WITH CHECK (EXISTS (
        SELECT 1 FROM team_memberships tm 
        WHERE tm.team_id = team_entries.team_id AND tm.user_id = auth.uid() 
        AND tm.role = 'admin' AND tm.is_active = true
    ));

CREATE POLICY "Team admins can update all entries" ON team_entries FOR UPDATE 
    USING (EXISTS (
        SELECT 1 FROM team_memberships tm 
        WHERE tm.team_id = team_entries.team_id AND tm.user_id = auth.uid() 
        AND tm.role = 'admin' AND tm.is_active = true
    ));

-- =============================================================================
-- 8. トリガーの設定
-- =============================================================================

-- 各テーブルに更新日時トリガーを設定
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_memberships_updated_at BEFORE UPDATE ON team_memberships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_groups_updated_at BEFORE UPDATE ON team_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER update_team_attendance_updated_at BEFORE UPDATE ON team_attendance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_entries_updated_at BEFORE UPDATE ON team_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 9. ユーティリティ関数の作成
-- =============================================================================

-- 招待コード生成関数
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
BEGIN
  RETURN upper(substring(md5(random()::text) from 1 for 8));
END;
$$ LANGUAGE plpgsql;

-- チーム作成時の招待コード自動生成トリガー
CREATE OR REPLACE FUNCTION set_invite_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := generate_invite_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_team_invite_code
  BEFORE INSERT ON teams
  FOR EACH ROW EXECUTE FUNCTION set_invite_code();

-- お知らせ公開時のpublished_at自動設定関数
CREATE OR REPLACE FUNCTION set_published_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_published = true AND OLD.is_published = false THEN
    NEW.published_at := NOW();
  ELSIF NEW.is_published = false THEN
    NEW.published_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_announcement_published_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION set_published_at();

-- チーム練習作成時の出欠レコード自動生成関数
CREATE OR REPLACE FUNCTION create_attendance_records_for_team_practice()
RETURNS TRIGGER AS $$
BEGIN
  -- team_idがある場合のみ出欠レコードを作成
  IF NEW.team_id IS NOT NULL THEN
    INSERT INTO team_attendance (schedule_id, user_id, status)
    SELECT NEW.id, tm.user_id, NULL
    FROM team_memberships tm
    WHERE tm.team_id = NEW.team_id 
    AND tm.is_active = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- チーム練習作成時のトリガー
CREATE TRIGGER create_attendance_on_team_practice
  AFTER INSERT ON practices
  FOR EACH ROW EXECUTE FUNCTION create_attendance_records_for_team_practice();

-- =============================================================================
-- マイグレーション完了
-- =============================================================================
