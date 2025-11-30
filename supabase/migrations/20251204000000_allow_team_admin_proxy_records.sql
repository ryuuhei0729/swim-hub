-- =============================================================================
-- マイグレーション: チーム管理者がメンバーの記録を代理登録できるようにする
-- 問題: RLSポリシーが user_id = auth.uid() で制限されているため、他メンバーの記録を作成できない
-- 解決: チーム管理者であれば、チームメンバーの記録を作成・更新・削除できるようにする
-- =============================================================================

-- records テーブル: チーム管理者による代理INSERT
DROP POLICY IF EXISTS "Team admins can insert team member records" ON "public"."records";
CREATE POLICY "Team admins can insert team member records" ON "public"."records"
FOR INSERT WITH CHECK (
  -- team_idが設定されている場合
  team_id IS NOT NULL
  AND
  -- ログインユーザーがそのチームの管理者である
  EXISTS (
    SELECT 1 FROM public.team_memberships tm
    WHERE tm.team_id = records.team_id
    AND tm.user_id = (SELECT auth.uid())
    AND tm.role = 'admin'
    AND tm.is_active = true
  )
  AND
  -- 対象ユーザーがそのチームのメンバーである
  EXISTS (
    SELECT 1 FROM public.team_memberships tm
    WHERE tm.team_id = records.team_id
    AND tm.user_id = records.user_id
    AND tm.is_active = true
  )
);

-- records テーブル: チーム管理者による代理UPDATE
DROP POLICY IF EXISTS "Team admins can update team member records" ON "public"."records";
CREATE POLICY "Team admins can update team member records" ON "public"."records"
FOR UPDATE USING (
  team_id IS NOT NULL
  AND
  -- ログインユーザーがそのチームの管理者である
  EXISTS (
    SELECT 1 FROM public.team_memberships tm
    WHERE tm.team_id = records.team_id
    AND tm.user_id = (SELECT auth.uid())
    AND tm.role = 'admin'
    AND tm.is_active = true
  )
  AND
  -- 対象ユーザーがそのチームのアクティブなメンバーである
  EXISTS (
    SELECT 1 FROM public.team_memberships tm
    WHERE tm.team_id = records.team_id
    AND tm.user_id = records.user_id
    AND tm.is_active = true
  )
);

-- records テーブル: チーム管理者による代理DELETE
DROP POLICY IF EXISTS "Team admins can delete team member records" ON "public"."records";
CREATE POLICY "Team admins can delete team member records" ON "public"."records"
FOR DELETE USING (
  team_id IS NOT NULL
  AND
  -- ログインユーザーがそのチームの管理者である
  EXISTS (
    SELECT 1 FROM public.team_memberships tm
    WHERE tm.team_id = records.team_id
    AND tm.user_id = (SELECT auth.uid())
    AND tm.role = 'admin'
    AND tm.is_active = true
  )
  AND
  -- 対象ユーザーがそのチームのアクティブなメンバーである
  EXISTS (
    SELECT 1 FROM public.team_memberships tm
    WHERE tm.team_id = records.team_id
    AND tm.user_id = records.user_id
    AND tm.is_active = true
  )
);

-- records テーブル: チームメンバーは自分のチーム記録を閲覧可能
DROP POLICY IF EXISTS "Team members can view team records" ON "public"."records";
CREATE POLICY "Team members can view team records" ON "public"."records"
FOR SELECT USING (
  team_id IS NOT NULL
  AND
  EXISTS (
    SELECT 1 FROM public.team_memberships tm
    WHERE tm.team_id = records.team_id
    AND tm.user_id = (SELECT auth.uid())
    AND tm.is_active = true
  )
);

-- split_times テーブル: レコードに紐づくスプリットタイムも同様に
-- まず、既存のポリシーを確認して必要であれば追加

-- split_times: チーム管理者による代理INSERT
DROP POLICY IF EXISTS "Team admins can insert team member split_times" ON "public"."split_times";
CREATE POLICY "Team admins can insert team member split_times" ON "public"."split_times"
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.records r
    JOIN public.team_memberships tm ON tm.team_id = r.team_id
    WHERE r.id = split_times.record_id
    AND r.team_id IS NOT NULL
    AND tm.user_id = (SELECT auth.uid())
    AND tm.role = 'admin'
    AND tm.is_active = true
  )
);

-- split_times: チーム管理者による代理UPDATE
DROP POLICY IF EXISTS "Team admins can update team member split_times" ON "public"."split_times";
CREATE POLICY "Team admins can update team member split_times" ON "public"."split_times"
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.records r
    JOIN public.team_memberships tm ON tm.team_id = r.team_id
    WHERE r.id = split_times.record_id
    AND r.team_id IS NOT NULL
    AND tm.user_id = (SELECT auth.uid())
    AND tm.role = 'admin'
    AND tm.is_active = true
  )
);

-- split_times: チーム管理者による代理DELETE
DROP POLICY IF EXISTS "Team admins can delete team member split_times" ON "public"."split_times";
CREATE POLICY "Team admins can delete team member split_times" ON "public"."split_times"
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.records r
    JOIN public.team_memberships tm ON tm.team_id = r.team_id
    WHERE r.id = split_times.record_id
    AND r.team_id IS NOT NULL
    AND tm.user_id = (SELECT auth.uid())
    AND tm.role = 'admin'
    AND tm.is_active = true
  )
);

-- split_times: チームメンバーはチーム記録のスプリットを閲覧可能
DROP POLICY IF EXISTS "Team members can view team split_times" ON "public"."split_times";
CREATE POLICY "Team members can view team split_times" ON "public"."split_times"
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.records r
    JOIN public.team_memberships tm ON tm.team_id = r.team_id
    WHERE r.id = split_times.record_id
    AND r.team_id IS NOT NULL
    AND tm.user_id = (SELECT auth.uid())
    AND tm.is_active = true
  )
);

