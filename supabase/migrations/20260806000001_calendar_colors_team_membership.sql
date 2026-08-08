-- =============================================================================
-- セキュリティ監査 Medium: M-10 (user_team_calendar_colors の team_id 未検証
-- + 除名時クリーンアップの no-op)
-- =============================================================================
--
-- 背景:
--   (A) "Users can insert own calendar colors"
--       (20260722000000_add_calendar_color_customization.sql:74-76) は
--       WITH CHECK ((select auth.uid()) = user_id) のみで、team_id の所属確認
--       を一切行っていない。非メンバーが任意の他チームの team_id を指定して
--       行を INSERT できてしまう (自分の色設定なので実害は限定的だが、
--       所属していないチームに紐づくデータを持てる状態は監査上の指摘対象)。
--
--   (B) 除名 (remove()) 時のカレンダー色クリーンアップが no-op になっている。
--       既存 DELETE ポリシー "Users can delete own calendar colors" は
--       USING ((select auth.uid()) = user_id) のみで、呼び出し元が管理者
--       (auth.uid() = 管理者) で対象行の user_id = 除名対象者の場合は削除
--       対象 0 行になる (エラー無しの無音失敗)。管理者による除名分岐を追加する。
--
-- 対策:
--   (A) INSERT ポリシーに is_team_member(team_id, user_id) の所属検証を追加する
--       (team_id は NOT NULL なので NULL 分岐は不要)。
--       20260801000001_fix_competitions_practices_insert_rls.sql と同種の
--       is_team_member 検証パターンに合わせる。
--   (B) DELETE ポリシーに is_team_admin(team_id, auth.uid()) の管理者分岐を
--       追加する。
--
-- 影響確認 (正規フローが壊れない根拠):
--   - INSERT/UPSERT: apps/shared/hooks/queries/calendarColors.ts の
--     upsertTeamColors は本人が自分の所属チームの色を設定する経路のみで、
--     is_team_member(team_id, auth.uid()) の枝で従来どおり許可される。
--   - DELETE (本人の leave()): (select auth.uid()) = user_id の枝で従来どおり
--     許可される。
--   - DELETE (管理者の remove()): 新設した is_team_admin 分岐で許可される
--     (従来は無音の 0 行削除だったクリーンアップが実際に効くようになる)。
--
-- 冪等性: DROP POLICY IF EXISTS の後に CREATE POLICY するのみで、既存データ
-- (行そのもの) には影響しない。
-- =============================================================================

DROP POLICY IF EXISTS "Users can insert own calendar colors" ON "public"."user_team_calendar_colors";
CREATE POLICY "Users can insert own calendar colors" ON "public"."user_team_calendar_colors"
  FOR INSERT WITH CHECK (
    (SELECT "auth"."uid"()) = "user_id"
    AND public.is_team_member("user_team_calendar_colors"."team_id", (SELECT "auth"."uid"()))
  );

DROP POLICY IF EXISTS "Users can delete own calendar colors" ON "public"."user_team_calendar_colors";
CREATE POLICY "Users can delete own calendar colors" ON "public"."user_team_calendar_colors"
  FOR DELETE USING (
    (SELECT "auth"."uid"()) = "user_id"
    OR public.is_team_admin("user_team_calendar_colors"."team_id", (SELECT "auth"."uid"()))
  );
