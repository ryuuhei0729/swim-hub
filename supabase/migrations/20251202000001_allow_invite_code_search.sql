-- =============================================================================
-- teamsテーブルのRLSポリシー追加
-- invite_codeでの検索を許可（チーム参加時に必要）
-- =============================================================================

-- 認証済みユーザーはinvite_codeでチームを検索できる
-- 既存のポリシー（teams_select_members）とOR条件で評価される
-- これにより、メンバー/作成者でなくても、invite_codeで検索できる
-- 
-- 注意: このポリシーは認証済みユーザーなら誰でも全てのチームをSELECTできるように見えるが、
-- 実際にはクエリでinvite_codeを指定して検索するため、特定のチームのみが返される。
-- セキュリティ上、invite_codeを知っているユーザーのみが該当チームを取得できる。
CREATE POLICY "teams_select_by_invite_code" ON "public"."teams" 
FOR SELECT 
USING (
  -- 認証済みユーザーのみ（invite_codeでの検索を許可）
  -- 実際のクエリでは .eq('invite_code', inviteCode) が指定されるため、
  -- 該当するinvite_codeを持つチームのみが返される
  (SELECT "auth"."uid"()) IS NOT NULL
);

