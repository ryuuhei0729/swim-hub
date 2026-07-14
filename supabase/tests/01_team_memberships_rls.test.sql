-- =============================================================================
-- pgTAP: team_memberships RLS の実DB検証（回帰固定）
--
-- 対象 migration:
--   - 20260705000000 (C-1: 任意チームadmin INSERT / C-2: 自己role昇格)
--   - 20260705000001 (#40: anon GRANT 最小化)
--   - 20260706000000 (#38 A2b: 自己承認スキップ / #42: 自己INSERT撤去)
--
-- 方針:
--   - Supabase クライアントをモックせず、実際の RLS を role / JWT クレームの
--     切替で評価する（QA指摘: 既存テストは SQL 側ガードを未検証）。
--   - 攻撃 SQL は TeamMembersAPI を介さない from("team_memberships") 直叩き
--     （PostgREST 経由の生 UPDATE/INSERT/DELETE）を模す。
--   - 期待値は「攻撃者視点で何が起きるべきか」から記述し、実装をコピーしない。
--
-- 実行: ローカル Supabase 起動済み (supabase start + migration 適用済み) の状態で
--       `supabase test db` を実行する。全フィクスチャは rollback で消える。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(39);

-- -----------------------------------------------------------------------------
-- ヘルパー: JWT クレーム + ロール切替（rollback で消える）
-- -----------------------------------------------------------------------------
create function public.qa_login_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function public.qa_login_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end $$;

create function public.qa_logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

-- -----------------------------------------------------------------------------
-- フィクスチャ（postgres = BYPASSRLS で投入）
--   team1: admin_a(管理者/作成者), member_b(一般/active), pending_c(承認待ち)
--   team2: admin_x(管理者/作成者), member_y(一般/active)
--   outsider_d: どのチームにも未所属
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-4111-a111-000000000001', 'qa-rls-admin-a@example.test'),
  ('11111111-1111-4111-a111-000000000002', 'qa-rls-member-b@example.test'),
  ('11111111-1111-4111-a111-000000000003', 'qa-rls-pending-c@example.test'),
  ('11111111-1111-4111-a111-000000000004', 'qa-rls-outsider-d@example.test'),
  ('11111111-1111-4111-a111-000000000005', 'qa-rls-admin-x@example.test'),
  ('11111111-1111-4111-a111-000000000006', 'qa-rls-member-y@example.test');

-- on_auth_user_created トリガーが無い環境向けのバックフィル（あれば no-op）
insert into public.users (id, name)
select id, email from auth.users
where id in (
  '11111111-1111-4111-a111-000000000001',
  '11111111-1111-4111-a111-000000000002',
  '11111111-1111-4111-a111-000000000003',
  '11111111-1111-4111-a111-000000000004',
  '11111111-1111-4111-a111-000000000005',
  '11111111-1111-4111-a111-000000000006')
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('33333333-3333-4333-a333-000000000001', 'QA RLS Team1', 'QA-RLS-T1-CODE', '11111111-1111-4111-a111-000000000001'),
  ('33333333-3333-4333-a333-000000000002', 'QA RLS Team2', 'QA-RLS-T2-CODE', '11111111-1111-4111-a111-000000000005');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at, left_at) values
  ('33333333-3333-4333-a333-000000000001', '11111111-1111-4111-a111-000000000001', 'admin', 'approved', true,  '2026-01-01', null),
  ('33333333-3333-4333-a333-000000000001', '11111111-1111-4111-a111-000000000002', 'user',  'approved', true,  '2026-02-01', null),
  ('33333333-3333-4333-a333-000000000001', '11111111-1111-4111-a111-000000000003', 'user',  'pending',  false, '2026-05-01', null),
  ('33333333-3333-4333-a333-000000000002', '11111111-1111-4111-a111-000000000005', 'admin', 'approved', true,  '2026-01-01', null),
  ('33333333-3333-4333-a333-000000000002', '11111111-1111-4111-a111-000000000006', 'user',  'approved', true,  '2026-03-01', null);

-- =============================================================================
-- A. 自己承認スキップ不可 (#38 A2b)
--    pending ユーザーが自分の行を直接 UPDATE して approved/active になれないこと
-- =============================================================================
select public.qa_login_as('11111111-1111-4111-a111-000000000003'); -- pending_c

select throws_ok(
  $$ update public.team_memberships
     set status = 'approved', is_active = true
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = auth.uid() $$,
  '42501', null,
  'A-1: pending ユーザーの自己承認 (status=approved, is_active=true) は WITH CHECK で拒否される');

select throws_ok(
  $$ update public.team_memberships
     set status = 'approved'
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = auth.uid() $$,
  '42501', null,
  'A-2: is_active を変えず status=approved のみの自己更新も拒否される (is_team_member=false)');

select throws_ok(
  $$ update public.team_memberships
     set status = 'approved', is_active = false, left_at = '2020-01-01'
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = auth.uid() $$,
  '42501', null,
  'A-3: 退会済み偽装 (approved/inactive/left_at 偽装) → reactivate の二段階攻撃も入口で拒否される');

select public.qa_logout();

select results_eq(
  $$ select role, status::text, is_active, left_at, joined_at
     from public.team_memberships
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = '11111111-1111-4111-a111-000000000003' $$,
  $$ values ('user'::text, 'pending'::text, false, null::date, '2026-05-01'::date) $$,
  'A-4: 攻撃後も pending 行は一切変更されていない');

-- =============================================================================
-- B. role 昇格不可 (C-2)
-- =============================================================================
select public.qa_login_as('11111111-1111-4111-a111-000000000002'); -- member_b

select throws_ok(
  $$ update public.team_memberships
     set role = 'admin'
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = auth.uid() $$,
  '42501', null,
  'B-1: 一般メンバーの自己 role=admin 昇格は WITH CHECK で拒否される');

select public.qa_login_as('11111111-1111-4111-a111-000000000003'); -- pending_c

select throws_ok(
  $$ update public.team_memberships
     set role = 'admin'
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = auth.uid() $$,
  '42501', null,
  'B-2: pending ユーザーの自己 role=admin 昇格も拒否される');

select public.qa_login_as('11111111-1111-4111-a111-000000000002'); -- member_b

select lives_ok(
  $$ update public.team_memberships
     set role = 'user'
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = '11111111-1111-4111-a111-000000000001' $$,
  'B-3: 一般メンバーによる管理者の降格 UPDATE はエラーにならず USING で 0 行に絞られる');

select public.qa_logout();

select is(
  (select role from public.team_memberships
   where team_id = '33333333-3333-4333-a333-000000000001'
     and user_id = '11111111-1111-4111-a111-000000000001'),
  'admin',
  'B-4: 管理者の role は降格攻撃後も admin のまま');

select public.qa_login_as('11111111-1111-4111-a111-000000000002'); -- member_b

select lives_ok(
  $$ update public.team_memberships
     set status = 'approved', is_active = true
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = '11111111-1111-4111-a111-000000000003' $$,
  'B-5: 一般メンバーが他人の pending 行を承認しようとしても 0 行 (USING で不可視)');

select public.qa_logout();

select results_eq(
  $$ select status::text, is_active
     from public.team_memberships
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = '11111111-1111-4111-a111-000000000003' $$,
  $$ values ('pending'::text, false) $$,
  'B-6: 他人による承認攻撃後も pending 行は変更されていない');

-- =============================================================================
-- C. 自己 INSERT 撤去 (#42) + チーム作成者枝の回帰
-- =============================================================================
select public.qa_login_as('11111111-1111-4111-a111-000000000004'); -- outsider_d

select throws_ok(
  $$ insert into public.team_memberships (team_id, user_id, role, status, is_active)
     values ('33333333-3333-4333-a333-000000000001', auth.uid(), 'user', 'pending', false) $$,
  '42501', null,
  'C-1: 招待コードを経ない自己 INSERT (旧 join() 相当の pending 行) は RLS で拒否される');

select throws_ok(
  $$ insert into public.team_memberships (team_id, user_id, role, status, is_active)
     values ('33333333-3333-4333-a333-000000000001', auth.uid(), 'admin', 'approved', true) $$,
  '42501', null,
  'C-2: 旧 C-1 攻撃 (任意チームへ admin/approved/active を自己 INSERT) も拒否される');

select public.qa_login_as('11111111-1111-4111-a111-000000000002'); -- member_b

select throws_ok(
  $$ insert into public.team_memberships (team_id, user_id, role, status, is_active)
     values ('33333333-3333-4333-a333-000000000001', '11111111-1111-4111-a111-000000000004', 'user', 'pending', false) $$,
  '42501', null,
  'C-3: 一般メンバーが他人のメンバーシップ行を INSERT することも拒否される');

select public.qa_logout();

select is(
  (select count(*)::int from public.team_memberships
   where user_id = '11111111-1111-4111-a111-000000000004'),
  0,
  'C-4: INSERT 攻撃後も outsider の行は 1 件も作られていない');

-- 回帰: チーム作成者枝 (createTeam()) は引き続き動作する
select public.qa_login_as('11111111-1111-4111-a111-000000000004'); -- outsider_d

select lives_ok(
  $$ insert into public.teams (id, name, invite_code, created_by)
     values ('33333333-3333-4333-a333-000000000003', 'QA RLS Team3', 'QA-RLS-T3-CODE', auth.uid()) $$,
  'C-5: 認証ユーザーは created_by=自分 でチームを作成できる (回帰)');

select lives_ok(
  $$ insert into public.team_memberships (team_id, user_id, role, status, is_active)
     values ('33333333-3333-4333-a333-000000000003', auth.uid(), 'admin', 'approved', true) $$,
  'C-6: チーム作成者は自分の admin メンバーシップを INSERT できる (createTeam() 回帰)');

select public.qa_logout();

select results_eq(
  $$ select role, status::text, is_active
     from public.team_memberships
     where team_id = '33333333-3333-4333-a333-000000000003'
       and user_id = '11111111-1111-4111-a111-000000000004' $$,
  $$ values ('admin'::text, 'approved'::text, true) $$,
  'C-7: 作成者の admin メンバーシップが正しく保存されている');

-- =============================================================================
-- D. 自己 UPDATE 枝は leave() 専用（正常系回帰 + pending は leave 型も不可）
-- =============================================================================
select public.qa_login_as('11111111-1111-4111-a111-000000000002'); -- member_b

select lives_ok(
  $$ update public.team_memberships
     set is_active = false, left_at = current_date
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = auth.uid() $$,
  'D-1: 承認済みアクティブメンバーの leave() (is_active=false, left_at=today) は成功する (回帰)');

select public.qa_logout();

select results_eq(
  $$ select status::text, is_active, left_at
     from public.team_memberships
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = '11111111-1111-4111-a111-000000000002' $$,
  $$ values ('approved'::text, false, current_date) $$,
  'D-2: leave() 後の行は approved のまま inactive + left_at 記録');

-- 後続テストのため member_b をアクティブに戻す（postgres として直接復元）
update public.team_memberships
set is_active = true, left_at = null
where team_id = '33333333-3333-4333-a333-000000000001'
  and user_id = '11111111-1111-4111-a111-000000000002';

select public.qa_login_as('11111111-1111-4111-a111-000000000003'); -- pending_c

select throws_ok(
  $$ update public.team_memberships
     set is_active = false, left_at = current_date
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = auth.uid() $$,
  '42501', null,
  'D-3: pending ユーザーは leave 型の自己 UPDATE すら通らない (is_team_member=false)');

-- -----------------------------------------------------------------------------
-- D-4〜D-6: 自己 UPDATE 枝の形状締め直し (Task D)
--   leave() の正確な形状 (status=approved のまま inactive + left_at 記録) 以外は
--   アクティブメンバー自身でも拒否されること。
--   攻撃シナリオ: アクティブメンバーが自分の行を status='pending' に書き換えて
--   管理者の承認待ち一覧に偽の申請を注入する / left_at 未記録のまま退会状態を作り
--   reactivate ガード (left_at is not null) との整合を崩す。
-- -----------------------------------------------------------------------------
select public.qa_login_as('11111111-1111-4111-a111-000000000002'); -- member_b (approved/active)

select throws_ok(
  $$ update public.team_memberships
     set status = 'pending', is_active = false, left_at = current_date
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = auth.uid() $$,
  '42501', null,
  'D-4: アクティブメンバーの自己 UPDATE で status=pending 注入 (承認待ち一覧グリーフィング) は拒否される');

select throws_ok(
  $$ update public.team_memberships
     set is_active = false
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = auth.uid() $$,
  '42501', null,
  'D-5: left_at を記録しない (NULL のまま) 自己退会は拒否される (leave() の形状のみ許可)');

select public.qa_logout();

select results_eq(
  $$ select role, status::text, is_active, left_at
     from public.team_memberships
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = '11111111-1111-4111-a111-000000000002' $$,
  $$ values ('user'::text, 'approved'::text, true, null::date) $$,
  'D-6: D-4/D-5 の攻撃後も member_b の行は approved/active/left_at=null のまま変更されていない');

-- =============================================================================
-- E. テナント越境不可 + 管理者の正常系回帰
-- =============================================================================
select public.qa_login_as('11111111-1111-4111-a111-000000000002'); -- member_b (team1 のみ所属)

select lives_ok(
  $$ update public.team_memberships
     set is_active = false
     where team_id = '33333333-3333-4333-a333-000000000002'
       and user_id = '11111111-1111-4111-a111-000000000006' $$,
  'E-1: 他チームメンバー行への UPDATE はエラーにならず 0 行 (USING で不可視)');

select public.qa_logout();

select is(
  (select is_active from public.team_memberships
   where team_id = '33333333-3333-4333-a333-000000000002'
     and user_id = '11111111-1111-4111-a111-000000000006'),
  true,
  'E-2: 越境 UPDATE 後も team2 メンバーは active のまま');

select public.qa_login_as('11111111-1111-4111-a111-000000000002'); -- member_b

select lives_ok(
  $$ delete from public.team_memberships
     where team_id = '33333333-3333-4333-a333-000000000002'
       and user_id = '11111111-1111-4111-a111-000000000006' $$,
  'E-3: 他チームメンバー行への DELETE はエラーにならず 0 行');

select public.qa_logout();

select is(
  (select count(*)::int from public.team_memberships
   where team_id = '33333333-3333-4333-a333-000000000002'
     and user_id = '11111111-1111-4111-a111-000000000006'),
  1,
  'E-4: 越境 DELETE 後も team2 メンバー行は存在する');

select public.qa_login_as('11111111-1111-4111-a111-000000000001'); -- admin_a (team1 管理者)

select lives_ok(
  $$ update public.team_memberships
     set role = 'admin'
     where team_id = '33333333-3333-4333-a333-000000000002'
       and user_id = '11111111-1111-4111-a111-000000000006' $$,
  'E-5: 別チームの管理者でも team2 の行は UPDATE できない (0 行)');

select public.qa_logout();

select is(
  (select role from public.team_memberships
   where team_id = '33333333-3333-4333-a333-000000000002'
     and user_id = '11111111-1111-4111-a111-000000000006'),
  'user',
  'E-6: 越境 role 変更後も team2 メンバーの role は user のまま');

select public.qa_login_as('11111111-1111-4111-a111-000000000001'); -- admin_a

select lives_ok(
  $$ delete from public.team_memberships
     where team_id = '33333333-3333-4333-a333-000000000002'
       and user_id = '11111111-1111-4111-a111-000000000006' $$,
  'E-7: 別チームの管理者でも team2 の行は DELETE できない (0 行)');

select public.qa_logout();

select is(
  (select count(*)::int from public.team_memberships
   where team_id = '33333333-3333-4333-a333-000000000002'
     and user_id = '11111111-1111-4111-a111-000000000006'),
  1,
  'E-8: 越境 DELETE (管理者) 後も team2 メンバー行は存在する');

-- 回帰: 自チーム管理者の承認・ロール変更は引き続き動作する
select public.qa_login_as('11111111-1111-4111-a111-000000000001'); -- admin_a

select lives_ok(
  $$ update public.team_memberships
     set status = 'approved', is_active = true
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = '11111111-1111-4111-a111-000000000003' $$,
  'E-9: 自チーム管理者による承認 (approve) は成功する (回帰)');

select public.qa_logout();

select results_eq(
  $$ select status::text, is_active
     from public.team_memberships
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = '11111111-1111-4111-a111-000000000003' $$,
  $$ values ('approved'::text, true) $$,
  'E-10: 管理者承認後は approved/active になっている');

-- 状態復元（pending に戻す）
update public.team_memberships
set status = 'pending', is_active = false
where team_id = '33333333-3333-4333-a333-000000000001'
  and user_id = '11111111-1111-4111-a111-000000000003';

select public.qa_login_as('11111111-1111-4111-a111-000000000001'); -- admin_a

select lives_ok(
  $$ update public.team_memberships
     set role = 'admin'
     where team_id = '33333333-3333-4333-a333-000000000001'
       and user_id = '11111111-1111-4111-a111-000000000002' $$,
  'E-11: 自チーム管理者によるロール変更 (user→admin) は成功する (回帰)');

select public.qa_logout();

select is(
  (select role from public.team_memberships
   where team_id = '33333333-3333-4333-a333-000000000001'
     and user_id = '11111111-1111-4111-a111-000000000002'),
  'admin',
  'E-12: 管理者によるロール変更が反映されている');

-- 状態復元
update public.team_memberships
set role = 'user'
where team_id = '33333333-3333-4333-a333-000000000001'
  and user_id = '11111111-1111-4111-a111-000000000002';

-- =============================================================================
-- F. anon GRANT 剥奪 (#40): RLS 以前に GRANT 層で全操作拒否
-- =============================================================================
select public.qa_login_anon();

select throws_ok(
  $$ select * from public.team_memberships $$,
  '42501', null,
  'F-1: anon は team_memberships を SELECT できない (GRANT 剥奪)');

select throws_ok(
  $$ insert into public.team_memberships (team_id, user_id)
     values ('33333333-3333-4333-a333-000000000001', '11111111-1111-4111-a111-000000000004') $$,
  '42501', null,
  'F-2: anon は INSERT できない');

select throws_ok(
  $$ update public.team_memberships set role = 'admin' $$,
  '42501', null,
  'F-3: anon は UPDATE できない');

select throws_ok(
  $$ delete from public.team_memberships $$,
  '42501', null,
  'F-4: anon は DELETE できない');

select public.qa_logout();

select * from finish();
rollback;
