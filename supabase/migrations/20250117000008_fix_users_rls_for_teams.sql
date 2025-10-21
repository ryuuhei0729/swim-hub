-- チームメンバーシップを通じて他のユーザーのプロフィール情報を取得できるようにする
-- チームメンバー間でプロフィール情報を共有するポリシーを追加

-- 既存のポリシーを削除
DROP POLICY IF EXISTS "Users can view own profile" ON users;

-- 新しいポリシー：自分のプロフィール + 同じチームのメンバーのプロフィールを閲覧可能
CREATE POLICY "Users can view own profile and team members" ON users
  FOR SELECT
  USING (
    auth.uid() = id OR 
    id IN (
      SELECT tm.user_id 
      FROM team_memberships tm 
      WHERE tm.team_id IN (
        SELECT team_id 
        FROM team_memberships 
        WHERE user_id = auth.uid() 
        AND is_active = true
      )
      AND tm.is_active = true
    )
  );
