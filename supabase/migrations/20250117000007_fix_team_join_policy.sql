-- チーム参加のためのRLSポリシー修正
-- 一般ユーザーがチームに参加できるようにする

-- 既存のメンバーシップ管理ポリシーを削除
DROP POLICY IF EXISTS "Team admins can manage memberships" ON team_memberships;
DROP POLICY IF EXISTS "Authenticated users can join teams" ON team_memberships;

-- チーム参加ポリシー（INSERT）- 認証済みユーザーはチームに参加可能
CREATE POLICY "Authenticated users can join teams" ON team_memberships FOR INSERT 
    WITH CHECK (
        auth.uid() IS NOT NULL AND 
        auth.uid() = user_id
    );
