-- =============================================================================
-- pgTAP: get_team_competition_goal_targets RPC (代理入力の「目標: xx.xx」バッジ用)
--
-- 対象 migration: 20261005000000_get_team_competition_goal_targets_rpc.sql
-- 基準: Sprint Contract (goal_target_badge) 付録 A
--   - 拒否はすべて RAISE EXCEPTION (P0001)。個人大会 (team_id NULL) の id・存在しない id・
--     他チームの大会 id もすべて例外
--   - 返す行 = goals.competition_id = 指定大会 かつ goals.user_id が p_team_id の
--     承認済み・アクティブなメンバー。status では絞らない (表示対象の述語は TS 側が唯一の定義元)
--   - 返す列は user_id / style_id / target_time / status の4つだけ
--
-- 方針: 期待値はフィクスチャの正解から書く。各アサーションには「条件を1つ外すと赤になる」
--       罠行がある。実行は `supabase test db` (rollback で消える)。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(29);

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

-- authenticated ロールだが sub が無い = auth.uid() が NULL
create function public.qa_login_null_uid() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'authenticated', true);
end $$;

create function public.qa_logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

-- -----------------------------------------------------------------------------
-- フィクスチャ (postgres = BYPASSRLS)
--   a1 admin_ok        team1 admin / approved / active (自身も目標を持つ)
--   a2 admin_pending   team1 admin / pending
--   a3 admin_inactive  team1 admin / approved / is_active=false
--   a4 admin_nullact   team1 admin / approved / is_active=NULL
--   a5 admin_team2     team2 の admin (team1 に非所属)
--   a6 plain           team1 の一般メンバー (role='user')
--   a7 member_x        team1 の承認済みアクティブメンバー (c1 に3種目の目標)
--   a8 member_y        team1 の承認済みアクティブメンバー (c1 に a7 と同じ種目2の目標。値は別)
--   a9 left            team1 に approved だが is_active=false (退会済み) / c1 に目標
--   b1 pending_member  team1 に pending / c1 に目標
--   b2 outsider        どのチームにも非所属 / c1 に目標
--   b4 nullact_member  team1 に approved / is_active=NULL / c1 に目標
--   b5 team2_member    team2 の承認済みアクティブメンバー / c3 (team2 の大会) に目標
-- 大会: c1=team1 の対象大会 / c2=team1 の別大会 / c3=team2 の大会 /
--       c4=a7 の個人大会 (team_id NULL) / c5=team1 の大会 (目標なし)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email)
select ('aaaaaaaa-1900-4000-a000-0000000000' || suffix)::uuid, 'qa-gt-' || suffix || '@example.test'
from (values ('a1'),('a2'),('a3'),('a4'),('a5'),('a6'),('a7'),('a8'),('a9'),('b1'),('b2'),('b4'),('b5')) v(suffix);

insert into public.users (id, name)
select id, email from auth.users where email like 'qa-gt-%@example.test'
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('bbbbbbbb-1900-4000-a000-000000000001', 'QA GT Team1', 'QA-GT-T1-CODE', 'aaaaaaaa-1900-4000-a000-0000000000a1'),
  ('bbbbbbbb-1900-4000-a000-000000000002', 'QA GT Team2', 'QA-GT-T2-CODE', 'aaaaaaaa-1900-4000-a000-0000000000a5');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at, left_at) values
  ('bbbbbbbb-1900-4000-a000-000000000001', 'aaaaaaaa-1900-4000-a000-0000000000a1', 'admin', 'approved', true,  '2026-01-01', null),
  ('bbbbbbbb-1900-4000-a000-000000000001', 'aaaaaaaa-1900-4000-a000-0000000000a2', 'admin', 'pending',  true,  '2026-01-01', null),
  ('bbbbbbbb-1900-4000-a000-000000000001', 'aaaaaaaa-1900-4000-a000-0000000000a3', 'admin', 'approved', false, '2026-01-01', '2026-06-01'),
  ('bbbbbbbb-1900-4000-a000-000000000001', 'aaaaaaaa-1900-4000-a000-0000000000a4', 'admin', 'approved', null,  '2026-01-01', null),
  ('bbbbbbbb-1900-4000-a000-000000000002', 'aaaaaaaa-1900-4000-a000-0000000000a5', 'admin', 'approved', true,  '2026-01-01', null),
  ('bbbbbbbb-1900-4000-a000-000000000001', 'aaaaaaaa-1900-4000-a000-0000000000a6', 'user',  'approved', true,  '2026-01-01', null),
  ('bbbbbbbb-1900-4000-a000-000000000001', 'aaaaaaaa-1900-4000-a000-0000000000a7', 'user',  'approved', true,  '2026-01-01', null),
  ('bbbbbbbb-1900-4000-a000-000000000001', 'aaaaaaaa-1900-4000-a000-0000000000a8', 'user',  'approved', true,  '2026-01-01', null),
  ('bbbbbbbb-1900-4000-a000-000000000001', 'aaaaaaaa-1900-4000-a000-0000000000a9', 'user',  'approved', false, '2026-01-01', '2026-06-01'),
  ('bbbbbbbb-1900-4000-a000-000000000001', 'aaaaaaaa-1900-4000-a000-0000000000b1', 'user',  'pending',  true,  '2026-01-01', null),
  ('bbbbbbbb-1900-4000-a000-000000000001', 'aaaaaaaa-1900-4000-a000-0000000000b4', 'user',  'approved', null,  '2026-01-01', null),
  ('bbbbbbbb-1900-4000-a000-000000000002', 'aaaaaaaa-1900-4000-a000-0000000000b5', 'user',  'approved', true,  '2026-01-01', null);

insert into public.competitions (id, title, date, pool_type, team_id, user_id, created_by) values
  ('cccccccc-1900-4000-a000-000000000001', 'QA GT Team1 Meet', '2027-05-01', 1,
    'bbbbbbbb-1900-4000-a000-000000000001', null, 'aaaaaaaa-1900-4000-a000-0000000000a1'),
  ('cccccccc-1900-4000-a000-000000000002', 'QA GT Team1 Other', '2027-06-01', 1,
    'bbbbbbbb-1900-4000-a000-000000000001', null, 'aaaaaaaa-1900-4000-a000-0000000000a1'),
  ('cccccccc-1900-4000-a000-000000000003', 'QA GT Team2 Meet', '2027-07-01', 0,
    'bbbbbbbb-1900-4000-a000-000000000002', null, 'aaaaaaaa-1900-4000-a000-0000000000a5'),
  ('cccccccc-1900-4000-a000-000000000004', 'QA GT Personal', '2027-08-01', 1, null,
    'aaaaaaaa-1900-4000-a000-0000000000a7', 'aaaaaaaa-1900-4000-a000-0000000000a7'),
  ('cccccccc-1900-4000-a000-000000000005', 'QA GT Team1 NoGoals', '2027-09-01', 1,
    'bbbbbbbb-1900-4000-a000-000000000001', null, 'aaaaaaaa-1900-4000-a000-0000000000a1');

-- c1 の目標 (期待される返却は a1/s4, a7/s1(cancelled), a7/s2, a7/s3(achieved), a8/s2 の5行)
insert into public.goals (id, user_id, competition_id, style_id, target_time, start_time, status, reflection_note) values
  ('dddddddd-1900-4000-a000-000000000001', 'aaaaaaaa-1900-4000-a000-0000000000a7', 'cccccccc-1900-4000-a000-000000000001', 2, 28.00, 30.00, 'active',    'SECRET-NOTE'),
  ('dddddddd-1900-4000-a000-000000000002', 'aaaaaaaa-1900-4000-a000-0000000000a7', 'cccccccc-1900-4000-a000-000000000001', 3, 60.00, 64.00, 'achieved',  null),
  ('dddddddd-1900-4000-a000-000000000003', 'aaaaaaaa-1900-4000-a000-0000000000a7', 'cccccccc-1900-4000-a000-000000000001', 1, 25.00, 27.00, 'cancelled', null),
  ('dddddddd-1900-4000-a000-000000000004', 'aaaaaaaa-1900-4000-a000-0000000000a8', 'cccccccc-1900-4000-a000-000000000001', 2, 29.00, 31.00, 'active',    null),
  ('dddddddd-1900-4000-a000-000000000005', 'aaaaaaaa-1900-4000-a000-0000000000a1', 'cccccccc-1900-4000-a000-000000000001', 4, 55.00, 60.00, 'active',    null),
  -- 返してはいけない行 (退会済み / 承認待ち / 非所属 / is_active=NULL)
  ('dddddddd-1900-4000-a000-000000000006', 'aaaaaaaa-1900-4000-a000-0000000000a9', 'cccccccc-1900-4000-a000-000000000001', 2, 31.00, 33.00, 'active',    null),
  ('dddddddd-1900-4000-a000-000000000007', 'aaaaaaaa-1900-4000-a000-0000000000b1', 'cccccccc-1900-4000-a000-000000000001', 2, 32.00, 34.00, 'active',    null),
  ('dddddddd-1900-4000-a000-000000000008', 'aaaaaaaa-1900-4000-a000-0000000000b2', 'cccccccc-1900-4000-a000-000000000001', 2, 33.00, 35.00, 'active',    null),
  ('dddddddd-1900-4000-a000-000000000009', 'aaaaaaaa-1900-4000-a000-0000000000b4', 'cccccccc-1900-4000-a000-000000000001', 2, 34.00, 36.00, 'active',    null),
  -- 別の大会の目標 (c2 = team1 の別大会 / c4 = a7 の個人大会)。c1 の結果に混ざってはいけない
  ('dddddddd-1900-4000-a000-00000000000a', 'aaaaaaaa-1900-4000-a000-0000000000a7', 'cccccccc-1900-4000-a000-000000000002', 5, 70.00, 75.00, 'active',    null),
  ('dddddddd-1900-4000-a000-00000000000b', 'aaaaaaaa-1900-4000-a000-0000000000a7', 'cccccccc-1900-4000-a000-000000000004', 6, 80.00, 85.00, 'active',    null),
  -- team2 のみに所属するユーザー b5 の c1 (team1 の大会) への目標。p_team_id (team1) のメンバーではないので返してはいけない
  ('dddddddd-1900-4000-a000-00000000000d', 'aaaaaaaa-1900-4000-a000-0000000000b5', 'cccccccc-1900-4000-a000-000000000001', 4, 40.00, 42.00, 'active',    null),
  -- team2 の大会 c3 の目標 (team2 管理者から見える正常系)
  ('dddddddd-1900-4000-a000-00000000000c', 'aaaaaaaa-1900-4000-a000-0000000000b5', 'cccccccc-1900-4000-a000-000000000003', 2, 26.00, 28.00, 'active',    null);

-- =============================================================================
-- 属性・権限・戻り列 (V-01)
-- =============================================================================
select has_function('public', 'get_team_competition_goal_targets', array['uuid', 'uuid'],
  'V-01a: get_team_competition_goal_targets(uuid, uuid) が存在する');

select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_team_competition_goal_targets'),
  true, 'V-01b: SECURITY DEFINER');

select is(
  (select provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_team_competition_goal_targets'),
  's'::"char", 'V-01c: STABLE');

select ok(
  (select 'search_path=public' = any(proconfig) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_team_competition_goal_targets'),
  'V-01d: search_path=public 固定');

select ok(not has_function_privilege('anon', 'public.get_team_competition_goal_targets(uuid, uuid)', 'EXECUTE'),
  'V-01e: anon は EXECUTE 不可');

select ok(has_function_privilege('authenticated', 'public.get_team_competition_goal_targets(uuid, uuid)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.get_team_competition_goal_targets(uuid, uuid)', 'EXECUTE'),
  'V-01f: authenticated と service_role は EXECUTE 可');

select is(
  (select array_agg(a.n::text order by a.o)
   from pg_proc p
   join pg_namespace ns on ns.oid = p.pronamespace
   cross join lateral unnest(p.proargnames, p.proargmodes) with ordinality as a(n, m, o)
   where ns.nspname = 'public' and p.proname = 'get_team_competition_goal_targets' and a.m = 't'),
  array['user_id','style_id','target_time','status']::text[],
  'V-01g: 戻り列は user_id / style_id / target_time / status の4つだけ (reflection_note・start_time 等を含まない)');

-- =============================================================================
-- 認可 (V-02)。拒否はすべて RAISE EXCEPTION (P0001)。anon だけは権限エラー (42501)
-- =============================================================================
select public.qa_login_anon();
select throws_ok(
  $$ select * from public.get_team_competition_goal_targets('bbbbbbbb-1900-4000-a000-000000000001', 'cccccccc-1900-4000-a000-000000000001') $$,
  '42501', null, 'V-02a: anon は permission denied');

select public.qa_login_null_uid();
select throws_ok(
  $$ select * from public.get_team_competition_goal_targets('bbbbbbbb-1900-4000-a000-000000000001', 'cccccccc-1900-4000-a000-000000000001') $$,
  'P0001', 'authentication required', 'V-02b: auth.uid() が NULL なら例外');

select public.qa_login_as('aaaaaaaa-1900-4000-a000-0000000000a1');
select throws_ok(
  $$ select * from public.get_team_competition_goal_targets(null, 'cccccccc-1900-4000-a000-000000000001') $$,
  'P0001', 'p_team_id is required', 'V-02c: p_team_id が NULL なら例外');
select throws_ok(
  $$ select * from public.get_team_competition_goal_targets('bbbbbbbb-1900-4000-a000-000000000001', null) $$,
  'P0001', 'p_competition_id is required', 'V-02d: p_competition_id が NULL なら例外');

select public.qa_login_as('aaaaaaaa-1900-4000-a000-0000000000a6');
select throws_ok(
  $$ select * from public.get_team_competition_goal_targets('bbbbbbbb-1900-4000-a000-000000000001', 'cccccccc-1900-4000-a000-000000000001') $$,
  'P0001', 'not an approved active admin of the team', 'V-02e: 一般メンバー (role=user) は例外');

select public.qa_login_as('aaaaaaaa-1900-4000-a000-0000000000a5');
select throws_ok(
  $$ select * from public.get_team_competition_goal_targets('bbbbbbbb-1900-4000-a000-000000000001', 'cccccccc-1900-4000-a000-000000000001') $$,
  'P0001', 'not an approved active admin of the team', 'V-02f: 他チーム (team2) の管理者が team1 を指定すると例外');

select public.qa_login_as('aaaaaaaa-1900-4000-a000-0000000000a2');
select throws_ok(
  $$ select * from public.get_team_competition_goal_targets('bbbbbbbb-1900-4000-a000-000000000001', 'cccccccc-1900-4000-a000-000000000001') $$,
  'P0001', 'not an approved active admin of the team', 'V-02g: 承認待ちの管理者は例外');

select public.qa_login_as('aaaaaaaa-1900-4000-a000-0000000000a3');
select throws_ok(
  $$ select * from public.get_team_competition_goal_targets('bbbbbbbb-1900-4000-a000-000000000001', 'cccccccc-1900-4000-a000-000000000001') $$,
  'P0001', 'not an approved active admin of the team', 'V-02h: is_active=false の管理者は例外');

select public.qa_login_as('aaaaaaaa-1900-4000-a000-0000000000a4');
select throws_ok(
  $$ select * from public.get_team_competition_goal_targets('bbbbbbbb-1900-4000-a000-000000000001', 'cccccccc-1900-4000-a000-000000000001') $$,
  'P0001', 'not an approved active admin of the team', 'V-02i: is_active=NULL の管理者は例外 (IS TRUE であること)');

-- 大会 id のガード (正規の管理者 a1 が、チームに属さない大会 id を渡す)
select public.qa_login_as('aaaaaaaa-1900-4000-a000-0000000000a1');
select throws_ok(
  $$ select * from public.get_team_competition_goal_targets('bbbbbbbb-1900-4000-a000-000000000001', 'cccccccc-1900-4000-a000-000000000003') $$,
  'P0001', 'competition does not belong to the team', 'V-03a: 他チーム (team2) の大会 id を渡すと例外 (大会と team の結合ガード)');
select throws_ok(
  $$ select * from public.get_team_competition_goal_targets('bbbbbbbb-1900-4000-a000-000000000001', 'cccccccc-1900-4000-a000-000000000004') $$,
  'P0001', 'competition does not belong to the team', 'V-03b: 個人大会 (team_id NULL) の id を渡すと例外');
select throws_ok(
  $$ select * from public.get_team_competition_goal_targets('bbbbbbbb-1900-4000-a000-000000000001', 'cccccccc-1900-4000-a000-0000000000ff') $$,
  'P0001', 'competition does not belong to the team', 'V-03c: 存在しない大会 id を渡すと例外');

select public.qa_login_as('aaaaaaaa-1900-4000-a000-0000000000a5');
select throws_ok(
  $$ select * from public.get_team_competition_goal_targets('bbbbbbbb-1900-4000-a000-000000000002', 'cccccccc-1900-4000-a000-000000000001') $$,
  'P0001', 'competition does not belong to the team', 'V-03d: team2 の管理者が自分のチームを指定しても、team1 の大会 id なら例外');

-- =============================================================================
-- 正常系 (V-04): 管理者 a1 が team1 の大会 c1 を指定
-- =============================================================================
select public.qa_login_as('aaaaaaaa-1900-4000-a000-0000000000a1');

select is(
  (select count(*)::int from public.get_team_competition_goal_targets(
     'bbbbbbbb-1900-4000-a000-000000000001', 'cccccccc-1900-4000-a000-000000000001')),
  5, 'V-04a: c1 の目標は ちょうど5行 (a7 の3種目 + a8 + 管理者自身)');

select is(
  (select array_agg(g.user_id::text || ':' || g.style_id::text order by g.user_id, g.style_id)
   from public.get_team_competition_goal_targets(
     'bbbbbbbb-1900-4000-a000-000000000001', 'cccccccc-1900-4000-a000-000000000001') g),
  array[
    'aaaaaaaa-1900-4000-a000-0000000000a1:4',
    'aaaaaaaa-1900-4000-a000-0000000000a7:1',
    'aaaaaaaa-1900-4000-a000-0000000000a7:2',
    'aaaaaaaa-1900-4000-a000-0000000000a7:3',
    'aaaaaaaa-1900-4000-a000-0000000000a8:2'
  ]::text[],
  'V-04b: 返る (user, style) の集合が正解と完全一致 (別大会・個人大会・非メンバーの目標が混ざらない)');

select is(
  (select array_agg(g.user_id::text || ':' || g.style_id::text || '=' || g.target_time::text order by g.user_id)
   from public.get_team_competition_goal_targets(
     'bbbbbbbb-1900-4000-a000-000000000001', 'cccccccc-1900-4000-a000-000000000001') g
   where g.style_id = 2),
  array[
    'aaaaaaaa-1900-4000-a000-0000000000a7:2=28.00',
    'aaaaaaaa-1900-4000-a000-0000000000a8:2=29.00'
  ]::text[],
  'V-04c: 同じ種目でもメンバーごとに別の target_time が user_id つきで返る (行ごとの混線検出の土台)');

select is(
  (select array_agg(g.style_id::text || ':' || g.status order by g.style_id)
   from public.get_team_competition_goal_targets(
     'bbbbbbbb-1900-4000-a000-000000000001', 'cccccccc-1900-4000-a000-000000000001') g
   where g.user_id = 'aaaaaaaa-1900-4000-a000-0000000000a7'),
  array['1:cancelled','2:active','3:achieved']::text[],
  'V-04d: status で絞らず cancelled も返る (表示可否は TS の述語が唯一の定義元)。status 値がそのまま返る');

select is(
  (select count(*)::int
   from public.get_team_competition_goal_targets(
     'bbbbbbbb-1900-4000-a000-000000000001', 'cccccccc-1900-4000-a000-000000000001') g
   where g.user_id in (
     'aaaaaaaa-1900-4000-a000-0000000000a9',  -- 退会済み
     'aaaaaaaa-1900-4000-a000-0000000000b1',  -- 承認待ち
     'aaaaaaaa-1900-4000-a000-0000000000b2',  -- 非所属
     'aaaaaaaa-1900-4000-a000-0000000000b4',  -- is_active=NULL
     'aaaaaaaa-1900-4000-a000-0000000000b5')), -- 別チーム (team2) のみのメンバー
  0, 'V-04e: 退会済み・承認待ち・非所属・is_active=NULL・別チームのみのメンバーの目標は返らない');

select is(
  (select count(*)::int
   from public.get_team_competition_goal_targets(
     'bbbbbbbb-1900-4000-a000-000000000001', 'cccccccc-1900-4000-a000-000000000001') g
   where g.style_id in (5, 6)),
  0, 'V-04f: 別大会 c2 (種目5) と個人大会 c4 (種目6) の目標は c1 の結果に混ざらない');

select is(
  (select count(*)::int from public.get_team_competition_goal_targets(
     'bbbbbbbb-1900-4000-a000-000000000001', 'cccccccc-1900-4000-a000-000000000005')),
  0, 'V-04g: 目標が1件も無い team1 の大会は例外ではなく0行');

select public.qa_login_as('aaaaaaaa-1900-4000-a000-0000000000a5');
select is(
  (select array_agg(g.user_id::text || ':' || g.style_id::text || '=' || g.target_time::text)
   from public.get_team_competition_goal_targets(
     'bbbbbbbb-1900-4000-a000-000000000002', 'cccccccc-1900-4000-a000-000000000003') g),
  array['aaaaaaaa-1900-4000-a000-0000000000b5:2=26.00']::text[],
  'V-04h: team2 の管理者は team2 の大会 c3 の目標を取得できる (他チームの正常系)');

-- =============================================================================
-- RLS 不変 (V-05)
-- =============================================================================
select public.qa_login_as('aaaaaaaa-1900-4000-a000-0000000000a1');
select is_empty(
  $$ select 1 from public.goals
     where competition_id = 'cccccccc-1900-4000-a000-000000000001'
       and user_id <> 'aaaaaaaa-1900-4000-a000-0000000000a1' $$,
  'V-05a: 管理者が goals を直接 SELECT しても他人の行は0件のまま (RLS は変更されない)');

select public.qa_logout();
select * from finish();
rollback;
