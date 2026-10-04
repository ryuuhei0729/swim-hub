-- =============================================================================
-- pgTAP: get_team_member_goals RPC (チーム管理者がメンバーの目標を閲覧)
--
-- 対象 migration: 20261004000000_get_team_member_goals_rpc.sql
-- 基準: Sprint Contract v1 (スコープ = 選択メンバーの全目標 / 振り返り・achievements 非公開 /
--       拒否は RAISE EXCEPTION / current_best_time は生の MIN)
--
-- 方針:
--   - 期待値はフィクスチャの「正解」から書く。RPC の SQL を転記しない。
--   - current_best_time は apps/shared/api/goals.ts の getBestTimeForStyle と同一定義
--     (user_id / style_id / pool_type=大会の水路 / is_relaying=false / MIN(time))。
--     records.team_id では絞らない。管理者から RLS で不可視の他チーム記録も拾う。
--   - 各アサーションは「条件を1つ外すと赤になる」ようフィクスチャに罠行を置いてある。
--
-- 実行: `supabase test db` (全フィクスチャは rollback で消える)。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(40);

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
--   ユーザー (末尾 id):
--     a1 admin_ok        team1 admin / approved / active
--     a2 admin_pending   team1 admin / pending
--     a3 admin_inactive  team1 admin / approved / is_active=false
--     a4 admin_nullact   team1 admin / approved / is_active=NULL
--     a5 admin_other     team2 のみの admin (team1 に非所属)
--     a6 plain           team1 の一般メンバー (role='user')
--     a7 target          team1・team2 の承認済みアクティブメンバー (閲覧対象)
--     a8 t_pending       team1 に pending
--     a9 t_left          team1 に approved だが is_active=false (退会済み)
--     b1 t_nullact       team1 に approved / is_active=NULL
--     b2 outsider        どのチームにも非所属
--     b3 other_user      team1 のメンバー (「別ユーザーの記録」の罠用)
--     b4 team2_only      team2 のみの承認済みアクティブメンバー (team1 管理者から見て別チームの対象)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email)
select ('aaaaaaaa-0000-4000-a000-0000000000' || suffix)::uuid, 'qa-mg-' || suffix || '@example.test'
from (values ('a1'),('a2'),('a3'),('a4'),('a5'),('a6'),('a7'),('a8'),('a9'),('b1'),('b2'),('b3'),('b4')) v(suffix);

insert into public.users (id, name)
select id, email from auth.users where email like 'qa-mg-%@example.test'
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('bbbbbbbb-0000-4000-a000-000000000001', 'QA MG Team1', 'QA-MG-T1-CODE', 'aaaaaaaa-0000-4000-a000-0000000000a1'),
  ('bbbbbbbb-0000-4000-a000-000000000002', 'QA MG Team2', 'QA-MG-T2-CODE', 'aaaaaaaa-0000-4000-a000-0000000000a5');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at, left_at) values
  ('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a1', 'admin', 'approved', true,  '2026-01-01', null),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a2', 'admin', 'pending',  true,  '2026-01-01', null),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a3', 'admin', 'approved', false, '2026-01-01', '2026-06-01'),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a4', 'admin', 'approved', null,  '2026-01-01', null),
  ('bbbbbbbb-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-0000000000a5', 'admin', 'approved', true,  '2026-01-01', null),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a6', 'user',  'approved', true,  '2026-01-01', null),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7', 'user',  'approved', true,  '2026-01-01', null),
  ('bbbbbbbb-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-0000000000a7', 'user',  'approved', true,  '2026-01-01', null),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a8', 'user',  'pending',  true,  '2026-01-01', null),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a9', 'user',  'approved', false, '2026-01-01', '2026-06-01'),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000b1', 'user',  'approved', null,  '2026-01-01', null),
  ('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000b3', 'user',  'approved', true,  '2026-01-01', null),
  ('bbbbbbbb-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-0000000000b4', 'user',  'approved', true,  '2026-01-01', null);

-- 大会 (pool_type: 0=短水路 / 1=長水路)
--   c_personal: target の個人大会 (長水路)
--   c_team1:    team1 の大会 (長水路)
--   c_team2:    team2 = 管理者 a1 から見て「他チーム」の大会 (短水路)
insert into public.competitions (id, title, date, pool_type, team_id, user_id, created_by) values
  ('cccccccc-0000-4000-a000-000000000001', 'QA MG Personal Meet', '2027-05-01', 1, null,
    'aaaaaaaa-0000-4000-a000-0000000000a7', 'aaaaaaaa-0000-4000-a000-0000000000a7'),
  ('cccccccc-0000-4000-a000-000000000002', 'QA MG Team1 Meet', '2027-06-01', 1,
    'bbbbbbbb-0000-4000-a000-000000000001', null, 'aaaaaaaa-0000-4000-a000-0000000000a1'),
  ('cccccccc-0000-4000-a000-000000000003', 'QA MG Team2 Meet', '2026-03-01', 0,
    'bbbbbbbb-0000-4000-a000-000000000002', null, 'aaaaaaaa-0000-4000-a000-0000000000a5');

-- 目標。reflection_note / achievements には探知用の文字列 SECRET-* を入れる
--   g_personal: 個人大会 / 種目3  (best 検証: time=0 の記録が最小)
--   g_team1:    自チーム大会 / 種目1 (best 検証: 罠行だらけ)
--   g_other:    他チーム大会 (短水路) / 種目5 (記録なし → best NULL)
--   g_null:     大会 NULL / 種目2 (M は種目2・長水路の記録を持つが NULL でなければならない)
--   g_admin:    管理者 a1 自身の目標 (自己閲覧)
--   g_plain:    別ユーザー a6 の目標 (混入しないこと)
insert into public.goals (id, user_id, competition_id, style_id, target_time, start_time, status, reflection_note, created_at) values
  ('dddddddd-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7', 'cccccccc-0000-4000-a000-000000000001', 3, 58.00, 62.00, 'active',   'SECRET-GOAL-NOTE', '2026-01-01'),
  ('dddddddd-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-0000000000a7', 'cccccccc-0000-4000-a000-000000000002', 1, 28.00, 32.00, 'active',   'SECRET-GOAL-NOTE', '2026-01-02'),
  ('dddddddd-0000-4000-a000-000000000003', 'aaaaaaaa-0000-4000-a000-0000000000a7', 'cccccccc-0000-4000-a000-000000000003', 5, 60.00, 65.00, 'achieved', 'SECRET-GOAL-NOTE', '2026-01-03'),
  ('dddddddd-0000-4000-a000-000000000004', 'aaaaaaaa-0000-4000-a000-0000000000a7', null,                                   2, 29.00, 31.00, 'cancelled','SECRET-GOAL-NOTE', '2026-01-04'),
  ('dddddddd-0000-4000-a000-000000000005', 'aaaaaaaa-0000-4000-a000-0000000000a1', null,                                   2, 29.00, 31.00, 'active',   null, '2026-01-05'),
  ('dddddddd-0000-4000-a000-000000000006', 'aaaaaaaa-0000-4000-a000-0000000000a6', 'cccccccc-0000-4000-a000-000000000002', 1, 28.00, 32.00, 'active',   null, '2026-01-06');

-- マイルストーン。g_team1 に2件 (created_at 降順 = 本人画面 getMilestones と同じ並び)
insert into public.milestones (id, goal_id, title, type, params, deadline, status, achieved_at, reflection_done, reflection_note, created_at) values
  ('eeeeeeee-0000-4000-a000-000000000001', 'dddddddd-0000-4000-a000-000000000002', 'QA-MS-OLDER', 'time',
    '{"style": "Fr", "distance": 50, "target_time": 30.5}'::jsonb, '2027-01-01', 'in_progress', null, true, 'SECRET-MS-NOTE', '2026-02-01'),
  ('eeeeeeee-0000-4000-a000-000000000002', 'dddddddd-0000-4000-a000-000000000002', 'QA-MS-NEWER', 'time',
    '{"style": "Fr", "distance": 50, "target_time": 29.5}'::jsonb, '2027-02-01', 'achieved', '2026-08-01', true, 'SECRET-MS-NOTE', '2026-03-01');


-- records。g_team1 (種目1・長水路=1) の best の罠:
--   r_ok_personal 30.00  個人記録 (team_id NULL)             → 採用候補
--   r_other_team  28.50  team2 のチーム記録 (a1 から RLS で不可視) → 採用される (最小)
--   r_relay       25.00  is_relaying=true                      → 除外
--   r_short       24.00  短水路 (pool_type=0)                  → 除外
--   r_style       23.00  別種目 (種目2)                        → 除外 (g_null の罠も兼ねる)
--   r_user        22.00  別ユーザー a6                         → 除外
-- g_personal (種目3・長水路): time=0 の記録と 31.00 → 生の MIN = 0
insert into public.records (user_id, style_id, pool_type, time, is_relaying, team_id, competition_id) values
  ('aaaaaaaa-0000-4000-a000-0000000000a7', 1, 1, 30.00, false, null,                                   null),
  ('aaaaaaaa-0000-4000-a000-0000000000a7', 1, 1, 28.50, false, 'bbbbbbbb-0000-4000-a000-000000000002', null),
  ('aaaaaaaa-0000-4000-a000-0000000000a7', 1, 1, 25.00, true,  null,                                   null),
  ('aaaaaaaa-0000-4000-a000-0000000000a7', 1, 0, 24.00, false, null,                                   null),
  ('aaaaaaaa-0000-4000-a000-0000000000a7', 2, 1, 23.00, false, null,                                   null),
  ('aaaaaaaa-0000-4000-a000-0000000000a6', 1, 1, 22.00, false, null,                                   null),
  ('aaaaaaaa-0000-4000-a000-0000000000a7', 3, 1, 0.00,  false, null,                                   null),
  ('aaaaaaaa-0000-4000-a000-0000000000a7', 3, 1, 31.00, false, null,                                   null);

-- check_source 制約により record_id か practice_log_id が必須
insert into public.milestone_achievements (milestone_id, record_id, achieved_value, achieved_at)
select 'eeeeeeee-0000-4000-a000-000000000002', r.id, '{"secret": "SECRET-ACH"}'::jsonb, now()
from public.records r
where r.user_id = 'aaaaaaaa-0000-4000-a000-0000000000a7' and r.time = 30.00;

-- =============================================================================
-- 属性・権限・戻り列 (V-01)
-- =============================================================================
select has_function('public', 'get_team_member_goals', array['uuid', 'uuid'],
  'V-01a: get_team_member_goals(uuid, uuid) が存在する');

select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_team_member_goals'),
  true, 'V-01b: SECURITY DEFINER');

select is(
  (select provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_team_member_goals'),
  's'::"char", 'V-01c: STABLE');

select ok(
  (select 'search_path=public' = any(proconfig) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_team_member_goals'),
  'V-01d: search_path=public 固定');

select ok(not has_function_privilege('anon', 'public.get_team_member_goals(uuid, uuid)', 'EXECUTE'),
  'V-01e: anon は EXECUTE 不可');
select ok(has_function_privilege('authenticated', 'public.get_team_member_goals(uuid, uuid)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.get_team_member_goals(uuid, uuid)', 'EXECUTE'),
  'V-01f: authenticated と service_role は EXECUTE 可');

select is(
  (select array_agg(a.n::text order by a.o)
   from pg_proc p
   join pg_namespace ns on ns.oid = p.pronamespace
   cross join lateral unnest(p.proargnames, p.proargmodes) with ordinality as a(n, m, o)
   where ns.nspname = 'public' and p.proname = 'get_team_member_goals' and a.m = 't'),
  array['id','style_id','target_time','start_time','status','achieved_at','created_at',
        'competition_id','competition_title','competition_date','competition_pool_type',
        'current_best_time','milestones']::text[],
  'V-01g: 戻り列は Contract の13列だけ (reflection_note 等を含まない・順序も固定)');

-- =============================================================================
-- 認可 (V-02)。拒否はすべて RAISE EXCEPTION (P0001)。ここでは例外であることを固定する
-- =============================================================================
select public.qa_login_anon();
select throws_ok(
  $$ select * from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7') $$,
  '42501', null, 'V-02a: anon は permission denied');

select public.qa_login_null_uid();
select throws_ok(
  $$ select * from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7') $$,
  'P0001', 'authentication required', 'V-02b: auth.uid() が NULL なら authentication required');

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a6');
select throws_ok(
  $$ select * from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7') $$,
  'P0001', null, 'V-02c: 一般メンバー (role=user) は例外');

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a5');
select throws_ok(
  $$ select * from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7') $$,
  'P0001', null, 'V-02d: 他チーム (team2) の管理者が team1 を指定すると例外');

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a2');
select throws_ok(
  $$ select * from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7') $$,
  'P0001', null, 'V-02e: 承認待ち (status<>approved) の管理者は例外');

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a3');
select throws_ok(
  $$ select * from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7') $$,
  'P0001', null, 'V-02f: is_active=false の管理者は例外');

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a4');
select throws_ok(
  $$ select * from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7') $$,
  'P0001', null, 'V-02g: is_active=NULL の管理者は例外 (IS TRUE であること)');

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a1');
select throws_ok(
  $$ select * from public.get_team_member_goals(null, 'aaaaaaaa-0000-4000-a000-0000000000a7') $$,
  'P0001', 'p_team_id is required', 'V-02h: p_team_id が NULL なら p_team_id is required');
select throws_ok(
  $$ select * from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', null) $$,
  'P0001', 'p_member_id is required', 'V-02i: p_member_id が NULL なら p_member_id is required');
select throws_ok(
  $$ select * from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000b2') $$,
  'P0001', null, 'V-02j: 対象が非メンバーなら例外');
select throws_ok(
  $$ select * from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000b4') $$,
  'P0001', null, 'V-02n: 対象が別チーム (team2 のみ) の承認済みメンバーなら例外 (p_team_id との結合)');
select throws_ok(
  $$ select * from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a8') $$,
  'P0001', null, 'V-02k: 対象が承認待ちなら例外');
select throws_ok(
  $$ select * from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a9') $$,
  'P0001', null, 'V-02l: 対象が退会済み (is_active=false) なら例外');
select throws_ok(
  $$ select * from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000b1') $$,
  'P0001', null, 'V-02m: 対象が is_active=NULL なら例外');

-- =============================================================================
-- 正常系 (V-03): 管理者 a1 が target a7 を閲覧
-- =============================================================================
select is(
  (select array_agg(id::text order by id) from public.get_team_member_goals(
     'bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7')),
  array['dddddddd-0000-4000-a000-000000000001','dddddddd-0000-4000-a000-000000000002',
        'dddddddd-0000-4000-a000-000000000003','dddddddd-0000-4000-a000-000000000004']::text[],
  'V-03a: 対象の全目標 (個人大会/自チーム大会/他チーム大会/大会NULL) だけが返る。他人の目標は混ざらない');

select is(
  (select row(competition_title, competition_date, competition_pool_type)::text
   from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7')
   where id = 'dddddddd-0000-4000-a000-000000000001'),
  '("QA MG Personal Meet",2027-05-01,1)',
  'V-03b: 個人大会の目標は大会名・日付・水路つき');

select is(
  (select row(competition_title, competition_date, competition_pool_type)::text
   from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7')
   where id = 'dddddddd-0000-4000-a000-000000000003'),
  '("QA MG Team2 Meet",2026-03-01,0)',
  'V-03c: 他チーム大会の目標 (管理者が見られない大会) も大会名・日付・水路つき');

select is(
  (select row(competition_title, competition_date, competition_pool_type)::text
   from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7')
   where id = 'dddddddd-0000-4000-a000-000000000002'),
  '("QA MG Team1 Meet",2027-06-01,1)',
  'V-03d: 自チーム大会の目標は大会名・日付・水路つき');

select is(
  (select row(competition_id, competition_title, competition_date, competition_pool_type, current_best_time)::text
   from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7')
   where id = 'dddddddd-0000-4000-a000-000000000004'),
  '(,,,,)',
  'V-03e: 大会NULLの目標も返り、大会列と current_best_time は全て NULL (水路不明で短水路混入させない)');

select is(
  (select row(target_time, start_time, status)::text
   from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7')
   where id = 'dddddddd-0000-4000-a000-000000000003'),
  '(60.00,65.00,achieved)',
  'V-03f: 達成済み・過去大会の目標も返り target/start/status が正しい');

select is(
  (select count(*)::int from public.get_team_member_goals(
     'bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a1')),
  1, 'V-03g: 管理者が自分自身を対象にしても返る');

select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a5');
select is(
  (select count(*)::int from public.get_team_member_goals(
     'bbbbbbbb-0000-4000-a000-000000000002', 'aaaaaaaa-0000-4000-a000-0000000000a7')),
  4, 'V-03h: team2 の管理者が team2 のメンバー a7 を見ると全目標4件 (チーム横断の全目標)');
select public.qa_login_as('aaaaaaaa-0000-4000-a000-0000000000a1');

-- =============================================================================
-- マイルストーン (V-04) と非公開項目 (V-05)
-- =============================================================================
select is(
  (select array_agg(k order by k) from (
     select distinct jsonb_object_keys(m) as k
     from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7') g,
          jsonb_array_elements(g.milestones) m) s),
  array['achieved_at','deadline','id','params','status','title','type']::text[],
  'V-04a: milestones 要素のキーは厳密に7個 (reflection_note / reflection_done / goal_id 等を含まない)');

select is(
  (select array_agg(m->>'title' order by ord)
   from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7') g,
        jsonb_array_elements(g.milestones) with ordinality as e(m, ord)
   where g.id = 'dddddddd-0000-4000-a000-000000000002'),
  array['QA-MS-NEWER','QA-MS-OLDER']::text[],
  'V-04b: マイルストーンは created_at 降順 (本人画面 getMilestones と同じ)');

select is(
  (select row(jsonb_typeof(milestones), jsonb_array_length(milestones))::text
   from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7')
   where id = 'dddddddd-0000-4000-a000-000000000004'),
  '(array,0)',
  'V-04c: マイルストーン0件は NULL でなく空配列 []');

select is(
  (select count(*)::int
   from public.get_team_member_goals('bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7') t
   where t::text like '%SECRET%' or t::text like '%reflection%'),
  0, 'V-05a: 返却のどこにも振り返りメモ / reflection / achievements の値が含まれない');

-- =============================================================================
-- RLS 不変 (V-06): 管理者の直接 SELECT では他人の行は見えないまま
-- =============================================================================
select is_empty(
  $$ select 1 from public.goals where user_id = 'aaaaaaaa-0000-4000-a000-0000000000a7' $$,
  'V-06a: 管理者が goals を直接 SELECT しても対象メンバーの行は0件のまま');
select is_empty(
  $$ select 1 from public.milestones where goal_id = 'dddddddd-0000-4000-a000-000000000002' $$,
  'V-06b: 管理者が milestones を直接 SELECT しても0件のまま');
select is_empty(
  $$ select 1 from public.records where user_id = 'aaaaaaaa-0000-4000-a000-0000000000a7' and time = 28.50 $$,
  'V-06c: 他チームのチーム記録 (28.50) は管理者から RLS で不可視 = 下の V-07a が RPC の DEFINER 計算である証拠');

-- =============================================================================
-- current_best_time (V-07): getBestTimeForStyle と同一定義
-- =============================================================================
select is(
  (select current_best_time from public.get_team_member_goals(
     'bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7')
   where id = 'dddddddd-0000-4000-a000-000000000002'),
  28.50::numeric,
  'V-07a: best = 28.50 (他チームのチーム記録を含む最小。リレー25.00/短水路24.00/別種目23.00/別ユーザー22.00は除外)');

select is(
  (select current_best_time from public.get_team_member_goals(
     'bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7')
   where id = 'dddddddd-0000-4000-a000-000000000001'),
  0.00::numeric,
  'V-07b: time=0 の記録が最小ならそのまま 0 を返す (生の MIN。0 の扱いは TS の computeGoalProgress 側)');

select is(
  (select current_best_time from public.get_team_member_goals(
     'bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7')
   where id = 'dddddddd-0000-4000-a000-000000000003'),
  null::numeric,
  'V-07c: 大会の水路 (短水路) に該当記録が無ければ NULL (長水路の記録で埋めない)');

select is(
  (select count(*)::int from public.get_team_member_goals(
     'bbbbbbbb-0000-4000-a000-000000000001', 'aaaaaaaa-0000-4000-a000-0000000000a7')
   where current_best_time is not null),
  2,
  'V-07d: best が非NULLなのは g_personal(0.00) と g_team1(28.50) の2件だけ。大会NULLの目標は種目2の記録があっても NULL');

select public.qa_logout();
select * from finish();
rollback;
