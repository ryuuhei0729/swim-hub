-- =============================================================================
-- pgTAP: セキュリティ Medium M-7 / M-10 の実DB検証 (Sprint Contract V10/V11/V12)
--
-- 対象 migration:
--   - 20260806000000_restrict_subscriptions_insert_plan.sql (M-7)
--   - 20260806000001_calendar_colors_team_membership.sql (M-10)
--
-- 方針: 01_team_memberships_rls.test.sql と同じ role/JWT 切替パターンを使い、
-- 実際の RLS を評価する (実装をコピーせず、攻撃者/正規ユーザー視点で期待値を書く)。
--
-- 実行: ローカル Supabase 起動済み (supabase start + migration 適用済み) の状態で
--       `supabase test db` を実行する。全フィクスチャは rollback で消える。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- -----------------------------------------------------------------------------
-- ヘルパー: JWT クレーム + ロール切替 (01_team_memberships_rls.test.sql と同型)
-- -----------------------------------------------------------------------------
create function public.qa_login_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function public.qa_logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

-- -----------------------------------------------------------------------------
-- フィクスチャ
--   team1: admin_a(管理者), member_b(一般/所属), outsider_c(未所属)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('22222222-2222-4222-a222-000000000001', 'qa-m7m10-admin-a@example.test'),
  ('22222222-2222-4222-a222-000000000002', 'qa-m7m10-member-b@example.test'),
  ('22222222-2222-4222-a222-000000000003', 'qa-m7m10-outsider-c@example.test');

insert into public.users (id, name)
select id, email from auth.users
where id in (
  '22222222-2222-4222-a222-000000000001',
  '22222222-2222-4222-a222-000000000002',
  '22222222-2222-4222-a222-000000000003')
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('44444444-4444-4444-a444-000000000001', 'QA M7M10 Team1', 'QA-M7M10-T1-CODE', '22222222-2222-4222-a222-000000000001');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at, left_at) values
  ('44444444-4444-4444-a444-000000000001', '22222222-2222-4222-a222-000000000001', 'admin', 'approved', true, '2026-01-01', null),
  ('44444444-4444-4444-a444-000000000001', '22222222-2222-4222-a222-000000000002', 'user',  'approved', true, '2026-02-01', null);

-- handle_new_user トリガー相当 (テストでは auth.users insert トリガーが既に free 行を作っている
-- はずなので、無ければ作る。既存なら no-op)
insert into public.user_subscriptions (id, plan)
select id, 'free' from auth.users
where id in (
  '22222222-2222-4222-a222-000000000001',
  '22222222-2222-4222-a222-000000000002',
  '22222222-2222-4222-a222-000000000003')
on conflict (id) do nothing;

-- =============================================================================
-- V10: M-7 subscriptions_insert に plan 制約
-- =============================================================================

-- V10-1: handle_new_user トリガー経由の 'free' 行が既に存在する (正規フロー回帰)
select is(
  (select plan from public.user_subscriptions where id = '22222222-2222-4222-a222-000000000003'),
  'free',
  'V10-1: handle_new_user 経由の user_subscriptions は plan=free で作成されている (トリガー回帰)');

-- V10-2: 自己申告 plan='premium' での自己 INSERT は拒否される (別ユーザーで新規行を試す)
delete from public.user_subscriptions where id = '22222222-2222-4222-a222-000000000003';

select public.qa_login_as('22222222-2222-4222-a222-000000000003'); -- outsider_c

select throws_ok(
  $$ insert into public.user_subscriptions (id, plan) values (auth.uid(), 'premium') $$,
  '42501', null,
  'V10-2: plan=premium の自己申告 INSERT は WITH CHECK で拒否される');

-- V10-3: plan='free' の自己 INSERT は成功する (正規フロー: クライアント fallback insert 相当)
select lives_ok(
  $$ insert into public.user_subscriptions (id, plan) values (auth.uid(), 'free') $$,
  'V10-3: plan=free の自己 INSERT は許可される (fallback insert 回帰)');

select public.qa_logout();

select is(
  (select plan from public.user_subscriptions where id = '22222222-2222-4222-a222-000000000003'),
  'free',
  'V10-4: 拒否された premium INSERT の後も行は free のまま (攻撃が反映されていない)');

-- V10-5: 他人の id を指定した自己 INSERT は auth.uid()=id 検証で拒否される (テナント越境)
delete from public.user_subscriptions where id = '22222222-2222-4222-a222-000000000003';
select public.qa_login_as('22222222-2222-4222-a222-000000000003'); -- outsider_c

select throws_ok(
  $$ insert into public.user_subscriptions (id, plan) values ('22222222-2222-4222-a222-000000000002', 'free') $$,
  '42501', null,
  'V10-5: 他人の id への free INSERT も auth.uid()=id 不一致で拒否される');

select public.qa_logout();

-- =============================================================================
-- V11: M-10(A) INSERT に team_id 所属検証
-- =============================================================================

-- V11-1: 非メンバー (outsider_c) が team1 の色を INSERT すると拒否される
select public.qa_login_as('22222222-2222-4222-a222-000000000003'); -- outsider_c

select throws_ok(
  $$ insert into public.user_team_calendar_colors (user_id, team_id, practice_color, competition_color)
     values (auth.uid(), '44444444-4444-4444-a444-000000000001', '#ff0000', '#00ff00') $$,
  '42501', null,
  'V11-1: 非メンバーの team_id への calendar color INSERT は拒否される (M-10 A)');

select public.qa_logout();

select is(
  (select count(*)::int from public.user_team_calendar_colors
   where user_id = '22222222-2222-4222-a222-000000000003'),
  0,
  'V11-2: 拒否後も outsider の calendar color 行は 1 件も作られていない');

-- V11-3: 所属メンバー (member_b) が自チームの色を INSERT すると成功する (正規フロー回帰)
select public.qa_login_as('22222222-2222-4222-a222-000000000002'); -- member_b

select lives_ok(
  $$ insert into public.user_team_calendar_colors (user_id, team_id, practice_color, competition_color)
     values (auth.uid(), '44444444-4444-4444-a444-000000000001', '#111111', '#222222') $$,
  'V11-3: 所属チームへの calendar color INSERT は成功する (upsertTeamColors 回帰)');

select public.qa_logout();

select is(
  (select practice_color from public.user_team_calendar_colors
   where user_id = '22222222-2222-4222-a222-000000000002'
     and team_id = '44444444-4444-4444-a444-000000000001'),
  '#111111',
  'V11-4: member_b の calendar color が正しく保存されている');

-- =============================================================================
-- V12: M-10(B) DELETE に管理者分岐 (除名クリーンアップの no-op 解消)
-- =============================================================================

-- 事前状態: admin_a も自分の色を1件持つ想定 (leave() 回帰確認用)
select public.qa_login_as('22222222-2222-4222-a222-000000000001'); -- admin_a
select lives_ok(
  $$ insert into public.user_team_calendar_colors (user_id, team_id, practice_color, competition_color)
     values (auth.uid(), '44444444-4444-4444-a444-000000000001', '#333333', '#444444') $$,
  'V12-setup: admin_a も自分の calendar color を持つ');
select public.qa_logout();

-- V12-1: 管理者が「除名対象者 (member_b)」の calendar color 行を DELETE できる (no-op 解消)
select public.qa_login_as('22222222-2222-4222-a222-000000000001'); -- admin_a

select lives_ok(
  $$ delete from public.user_team_calendar_colors
     where user_id = '22222222-2222-4222-a222-000000000002'
       and team_id = '44444444-4444-4444-a444-000000000001' $$,
  'V12-1: 管理者による除名対象者の calendar color DELETE はエラーにならない');

select public.qa_logout();

select is(
  (select count(*)::int from public.user_team_calendar_colors
   where user_id = '22222222-2222-4222-a222-000000000002'
     and team_id = '44444444-4444-4444-a444-000000000001'),
  0,
  'V12-2: 管理者の DELETE が実際に行を削除している (旧: 0行のno-opだったクリーンアップが効く)');

-- V12-3: 本人の leave() (自分の calendar color を自分で DELETE) は従来通り動く
select public.qa_login_as('22222222-2222-4222-a222-000000000001'); -- admin_a (自分の行)

select lives_ok(
  $$ delete from public.user_team_calendar_colors
     where user_id = auth.uid()
       and team_id = '44444444-4444-4444-a444-000000000001' $$,
  'V12-3: 本人による自分の calendar color の DELETE (leave() 相当) は従来通り成功する');

select public.qa_logout();

select is(
  (select count(*)::int from public.user_team_calendar_colors
   where user_id = '22222222-2222-4222-a222-000000000001'
     and team_id = '44444444-4444-4444-a444-000000000001'),
  0,
  'V12-4: 本人 DELETE 後、admin_a の calendar color 行が削除されている');

-- V12-5: 非管理者 (一般メンバー) は他人の calendar color を DELETE できない (越境防止の回帰)
-- (V12-1/2 が本来削除するはずだった member_b の行を再利用する。V12-2 が FAIL する場合、
--  この行はまだ残っているため INSERT し直すと unique 制約違反になる。V12-2 が PASS する
--  実装に修正された場合は行が既に無いので、その場合のみ再作成する。)
select public.qa_login_as('22222222-2222-4222-a222-000000000002'); -- member_b (一般)
select lives_ok(
  $$ insert into public.user_team_calendar_colors (user_id, team_id, practice_color, competition_color)
     values (auth.uid(), '44444444-4444-4444-a444-000000000001', '#555555', '#666666')
     on conflict (user_id, team_id) do nothing $$,
  'V12-setup-2: member_b の calendar color が存在することを保証する (既存 or 再作成)');
select public.qa_logout();

select public.qa_login_as('22222222-2222-4222-a222-000000000003'); -- outsider_c は所属していないので admin でも member でもない
select lives_ok(
  $$ delete from public.user_team_calendar_colors
     where user_id = '22222222-2222-4222-a222-000000000002'
       and team_id = '44444444-4444-4444-a444-000000000001' $$,
  'V12-5: 非所属ユーザーの DELETE はエラーにならず 0 行 (is_team_admin=false, USINGで不可視)');
select public.qa_logout();

select is(
  (select count(*)::int from public.user_team_calendar_colors
   where user_id = '22222222-2222-4222-a222-000000000002'
     and team_id = '44444444-4444-4444-a444-000000000001'),
  1,
  'V12-6: 非所属ユーザーの越境 DELETE 後も member_b の行は削除されずに残っている');

select * from finish();
rollback;
