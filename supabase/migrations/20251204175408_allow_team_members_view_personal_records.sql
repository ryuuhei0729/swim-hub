-- チームメンバーは同じチームのメンバーの個人記録（team_id IS NULL）を閲覧可能
CREATE POLICY "Team members can view teammates' personal records" ON "public"."records"
FOR SELECT USING (
  team_id IS NULL
  AND
  public.shares_active_team(records.user_id, (SELECT auth.uid()))
);

