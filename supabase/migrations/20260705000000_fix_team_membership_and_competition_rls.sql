-- =============================================================================
-- セキュリティ監査による RLS 脆弱性修正 (Critical x2, High x1)
--
-- C-1 (Critical): team_memberships INSERT — 任意チームの admin になれる
--   旧ポリシー: auth.uid()=user_id OR teams.created_by=auth.uid() (role/status/is_active 無制約)
--   攻撃例: INSERT (team_id=他人チーム, user_id=自分, role='admin', is_active=true) が通っていた。
--   修正方針:
--     - 自己 INSERT 枝 (auth.uid()=user_id) を role='user', status='pending', is_active=false に制約。
--       これは招待コードによる参加申請時の初期値と一致する（teams/members.ts join() 参照）。
--     - チーム作成者枝 (teams.created_by=auth.uid()) は無制約のまま維持。
--       createTeam() は先に teams INSERT (created_by=userId) してから membership INSERT するため、
--       この時点で teams.created_by = auth.uid() が成立する。role='admin' はここで許可される。
--
-- C-2 (Critical): team_memberships UPDATE — 一般ユーザーが自己昇格できる
--   旧ポリシー: USING/WITH CHECK ともに is_team_admin() OR user_id=auth.uid() OR created_by 枝。
--   攻撃例: UPDATE team_memberships SET role='admin' WHERE user_id=auth.uid() が通っていた。
--   修正方針:
--     - USING は既存のまま（行の読み取り許可条件）。
--     - WITH CHECK の自己更新枝に「role は更新前と変わらないこと」を追加。
--       RLS は列単位制御ができないため、サブクエリで現在の role を取得して比較する。
--     - 正規の自己更新操作 (leave=is_active→false, 再申請=status→pending, 再活性化=status→approved)
--       はいずれも role を変更しないため、引き続き動作する。
--     - is_team_admin 枝と teams.created_by 枝は role 変更を含む UPDATE を許可（従来どおり）。
--
-- H-1 (High): competitions SELECT — 未認証 (anon) で全件読める
--   旧ポリシー: USING (true) + GRANT ALL ON competitions TO anon。
--   攻撃例: anon キーで全ユーザーの大会データを無制限ダンプ可能。
--   修正方針:
--     - USING を user_id=auth.uid() OR is_team_admin(team_id, auth.uid()) OR is_team_member(team_id, auth.uid()) に変更。
--       これは records/practices の SELECT ポリシーと同型のパターン。
--     - anon に対する GRANT ALL を GRANT SELECT のみに変更。INSERT/UPDATE/DELETE は
--       authenticated/service_role のみに残す（RLS がポリシー層、GRANT がテーブル権限層）。
--     - 全大会アクセス経路（web/mobile）は認証済みユーザーのみであることを調査で確認済み。
--       公開共有ページ・unauthenticated ルートからの competitions SELECT は存在しない。
-- =============================================================================


-- -----------------------------------------------------------------------------
-- C-1: team_memberships INSERT ポリシー修正
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert team memberships" ON "public"."team_memberships";

CREATE POLICY "Users can insert team memberships" ON "public"."team_memberships"
FOR INSERT WITH CHECK (
  -- チーム作成者枝: createTeam() が role='admin', status='approved', is_active=true で INSERT する経路。
  -- teams.created_by = auth.uid() が成立する（先に teams INSERT 済み）ため、列値を制約しない。
  (
    EXISTS (
      SELECT 1
      FROM "public"."teams"
      WHERE "teams"."id" = "team_memberships"."team_id"
        AND "teams"."created_by" = (SELECT "auth"."uid"())
    )
  )
  OR
  -- 自己参加申請枝: 招待コード経由の参加申請 (join())。
  -- role='user', status='pending', is_active=false のみを許可。
  -- これ以外の値 (role='admin' 等) を指定しても RLS が弾く。
  (
    (SELECT "auth"."uid"()) = "user_id"
    AND "role" = 'user'
    AND "status" = 'pending'
    AND "is_active" = false
  )
);


-- -----------------------------------------------------------------------------
-- C-2: team_memberships UPDATE ポリシー修正
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update team memberships" ON "public"."team_memberships";

CREATE POLICY "Users can update team memberships" ON "public"."team_memberships"
FOR UPDATE
USING (
  -- 行の読み取り許可条件（既存と同一）
  public.is_team_admin("team_memberships"."team_id", (SELECT "auth"."uid"()))
  OR
  ("user_id" = (SELECT "auth"."uid"()))
  OR
  (
    EXISTS (
      SELECT 1
      FROM "public"."teams"
      WHERE "teams"."id" = "team_memberships"."team_id"
        AND "teams"."created_by" = (SELECT "auth"."uid"())
    )
  )
)
WITH CHECK (
  -- チーム管理者枝: role 変更を含む任意の更新を許可（承認/拒否/ロール変更等）。
  public.is_team_admin("team_memberships"."team_id", (SELECT "auth"."uid"()))
  OR
  -- チーム作成者枝: 同上。
  (
    EXISTS (
      SELECT 1
      FROM "public"."teams"
      WHERE "teams"."id" = "team_memberships"."team_id"
        AND "teams"."created_by" = (SELECT "auth"."uid"())
    )
  )
  OR
  -- 自己更新枝: role の昇格を禁止する。
  -- leave() / 再申請 / reactivateMembership() はいずれも role を変更しないため影響なし。
  -- サブクエリで現在の role を取得し、UPDATE 後の role と一致することを要求する。
  (
    "user_id" = (SELECT "auth"."uid"())
    AND "role" = (
      SELECT tm_current."role"
      FROM "public"."team_memberships" tm_current
      WHERE tm_current."id" = "team_memberships"."id"
    )
  )
);


-- -----------------------------------------------------------------------------
-- H-1: competitions SELECT ポリシー修正 + anon GRANT 制限
-- -----------------------------------------------------------------------------

-- SELECT ポリシー: USING (true) → 認証済みユーザー自身またはチームメンバーに限定
DROP POLICY IF EXISTS "Users can view competitions" ON "public"."competitions";

CREATE POLICY "Users can view competitions" ON "public"."competitions"
FOR SELECT USING (
  -- 個人大会: 自分が作成した大会
  (SELECT "auth"."uid"()) = "user_id"
  OR
  -- チーム大会（チームメンバー）: is_team_member は SECURITY DEFINER 関数（RLS バイパス済み）
  (
    "team_id" IS NOT NULL
    AND public.is_team_member("team_id", (SELECT "auth"."uid"()))
  )
  OR
  -- チーム大会（チーム管理者）: 非アクティブな状態でも管理者は参照できる
  (
    "team_id" IS NOT NULL
    AND public.is_team_admin("team_id", (SELECT "auth"."uid"()))
  )
);

-- anon の GRANT を全権限から SELECT のみに制限
-- INSERT/UPDATE/DELETE は authenticated/service_role のみに残す
REVOKE ALL ON TABLE "public"."competitions" FROM "anon";
GRANT SELECT ON TABLE "public"."competitions" TO "anon";
-- anon は RLS により実際には行を読めないが、GRANT 層でも最小権限とする
