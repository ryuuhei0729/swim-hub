-- =============================================================================
-- pgTAP: DB スキーマレビューの修正 (20261201000000〜20261201000009)
--
--   S-1  達成の根拠になった練習ログ・記録を消しても、達成行が残って削除が成功する
--   S-2  Google のリフレッシュトークンは user_secrets にあり、本人の RPC 以外から読めない
--   S-3  持ち主のいない練習・大会は作れず、ユーザー削除で個人の練習・大会が消える。
--        チームを作ったユーザーも削除できる
--   S-4  team_memberships.is_active は status / left_at と一致しないと書けない
--   S-5  参照されている種目マスタは削除できない
--   S-6  使われていないテーブル・列の削除と、タグ削除時のテンプレートの掃除
--   S-7  列の型の統一
--   S-8  インデックス・ポリシー・関数の権限 (advisor 対応)
--   S-9  provider の綴り (revenucat → revenuecat)
--
-- 実行: `supabase test db` または psql で直接 (全フィクスチャは rollback で消える)。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(46);

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
-- フィクスチャ (postgres = BYPASSRLS)
--   ...01 owner   個人の練習・記録・目標を持つ選手。チーム T のメンバー
--   ...02 mate    チーム T のメンバー (owner のチームメイト)。チーム T2 の作成者
--   ...03 admin   チーム T の作成者・管理者 (アカウント削除の対象)
--   ...04 leaver  チーム T のメンバー。個人とチームの練習・大会を持つ (アカウント削除の対象)
--   ...05 admin4  チーム T4 の管理者。T4 の作成者 owner はもう T4 を抜けていて、admin4 からは見えない
--   チーム T3: mate が作成・管理。作成者が退会済み (user_id NULL) のチーム練習に owner のログがある
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('27270000-0000-4000-a000-000000000001', 'qa-sr-owner@example.test'),
  ('27270000-0000-4000-a000-000000000002', 'qa-sr-mate@example.test'),
  ('27270000-0000-4000-a000-000000000003', 'qa-sr-admin@example.test'),
  ('27270000-0000-4000-a000-000000000004', 'qa-sr-leaver@example.test'),
  ('27270000-0000-4000-a000-000000000005', 'qa-sr-admin4@example.test');

insert into public.users (id, name)
select id, email from auth.users where email like 'qa-sr-%@example.test'
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('27271000-0000-4000-a000-000000000001', 'QA SR Team', 'QA-SR-T1', '27270000-0000-4000-a000-000000000003'),
  ('27271000-0000-4000-a000-000000000002', 'QA SR Team2', 'QA-SR-T2', '27270000-0000-4000-a000-000000000002'),
  ('27271000-0000-4000-a000-000000000003', 'QA SR Team3', 'QA-SR-T3', '27270000-0000-4000-a000-000000000002'),
  ('27271000-0000-4000-a000-000000000004', 'QA SR Team4', 'QA-SR-T4', '27270000-0000-4000-a000-000000000001');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at, left_at) values
  ('27271000-0000-4000-a000-000000000001', '27270000-0000-4000-a000-000000000003', 'admin', 'approved', true, '2026-01-01', null),
  ('27271000-0000-4000-a000-000000000001', '27270000-0000-4000-a000-000000000001', 'user',  'approved', true, '2026-01-01', null),
  ('27271000-0000-4000-a000-000000000001', '27270000-0000-4000-a000-000000000002', 'user',  'approved', true, '2026-01-01', null),
  ('27271000-0000-4000-a000-000000000001', '27270000-0000-4000-a000-000000000004', 'user',  'approved', true, '2026-01-01', null),
  ('27271000-0000-4000-a000-000000000002', '27270000-0000-4000-a000-000000000002', 'admin', 'approved', true, '2026-01-01', null),
  ('27271000-0000-4000-a000-000000000003', '27270000-0000-4000-a000-000000000002', 'admin', 'approved', true, '2026-01-01', null),
  ('27271000-0000-4000-a000-000000000003', '27270000-0000-4000-a000-000000000001', 'user',  'approved', true, '2026-01-01', null),
  ('27271000-0000-4000-a000-000000000004', '27270000-0000-4000-a000-000000000001', 'admin', 'approved', false, '2026-01-01', '2026-06-01'),
  ('27271000-0000-4000-a000-000000000004', '27270000-0000-4000-a000-000000000005', 'admin', 'approved', true, '2026-01-01', null);

-- T3 のチーム練習 P3: 作成者は退会済み (user_id NULL)、owner のログ L3 が付いている
insert into public.practices (id, user_id, team_id, date) values
  ('27272000-0000-4000-a000-000000000003', null, '27271000-0000-4000-a000-000000000003', '2026-11-04');
insert into public.practice_logs (id, user_id, practice_id, style, rep_count, set_count, distance) values
  ('27273000-0000-4000-a000-000000000003', '27270000-0000-4000-a000-000000000001', '27272000-0000-4000-a000-000000000003', 'Fr', 1, 1, 50);

-- owner の個人練習 P1 (ログ L1) と P2 (ログ L2)、記録 R1。目標 → マイルストーン → 達成行3件
insert into public.practices (id, user_id, date) values
  ('27272000-0000-4000-a000-000000000001', '27270000-0000-4000-a000-000000000001', '2026-11-01'),
  ('27272000-0000-4000-a000-000000000002', '27270000-0000-4000-a000-000000000001', '2026-11-02');

insert into public.practice_logs (id, user_id, practice_id, style, rep_count, set_count, distance) values
  ('27273000-0000-4000-a000-000000000001', '27270000-0000-4000-a000-000000000001', '27272000-0000-4000-a000-000000000001', 'Fr', 1, 1, 50),
  ('27273000-0000-4000-a000-000000000002', '27270000-0000-4000-a000-000000000001', '27272000-0000-4000-a000-000000000002', 'Fr', 1, 1, 50);

-- R1 は達成の根拠、R2 は S-1f (根拠を2つ持つ達成行) 用
insert into public.records (id, user_id, style_id, time, pool_type)
select v.id::uuid, '27270000-0000-4000-a000-000000000001', (select min(id) from public.styles), 30.00, 0
from (values ('27274000-0000-4000-a000-000000000001'), ('27274000-0000-4000-a000-000000000002')) v(id);

insert into public.goals (id, user_id, style_id, target_time)
select '27275000-0000-4000-a000-000000000001', '27270000-0000-4000-a000-000000000001', min(id), 29.00 from public.styles;

insert into public.milestones (id, goal_id, title, type, params) values
  ('27276000-0000-4000-a000-000000000001', '27275000-0000-4000-a000-000000000001', 'QA SR', 'time', '{}');

insert into public.milestone_achievements (id, milestone_id, practice_log_id, record_id, achieved_value) values
  ('27277000-0000-4000-a000-000000000001', '27276000-0000-4000-a000-000000000001', '27273000-0000-4000-a000-000000000001', null, '{"time": 31.00}'),
  ('27277000-0000-4000-a000-000000000002', '27276000-0000-4000-a000-000000000001', null, '27274000-0000-4000-a000-000000000001', '{"time": 30.00}'),
  ('27277000-0000-4000-a000-000000000003', '27276000-0000-4000-a000-000000000001', '27273000-0000-4000-a000-000000000002', null, '{"time": 30.50}');

-- =============================================================================
-- S-1 達成の根拠の削除
-- =============================================================================
select lives_ok(
  $$ delete from public.practice_logs where id = '27273000-0000-4000-a000-000000000001' $$,
  'S-1a: 達成の根拠になった練習ログを削除できる (旧: check_source 違反で失敗)');

select is(
  (select count(*)::int from public.milestone_achievements
   where id = '27277000-0000-4000-a000-000000000001' and practice_log_id is null and record_id is null),
  1, 'S-1b: 根拠を消しても達成行は残り、両方 NULL になる');

select lives_ok(
  $$ delete from public.records where id = '27274000-0000-4000-a000-000000000001' $$,
  'S-1c: 達成の根拠になった記録を削除できる');

select is(
  (select achieved_value from public.milestone_achievements where id = '27277000-0000-4000-a000-000000000002'),
  '{"time": 30.00}'::jsonb, 'S-1d: 根拠の記録を消しても達成値 (achieved_value) は残る');

select public.qa_login_as('27270000-0000-4000-a000-000000000001');
select is(
  (public.replace_practice_logs(
     '27272000-0000-4000-a000-000000000002',
     jsonb_build_array(jsonb_build_object(
       'user_id', '27270000-0000-4000-a000-000000000001', 'style', 'Fr', 'swim_category', 'Swim',
       'rep_count', 1, 'set_count', 1, 'distance', 50)))->>'success')::boolean,
  true, 'S-1e: 達成の根拠になった練習を保存し直せる (replace_practice_logs はログを消して入れ直す)');
select public.qa_logout();

select is(
  (select achieved_value from public.milestone_achievements
   where id = '27277000-0000-4000-a000-000000000003' and practice_log_id is null and record_id is null),
  '{"time": 30.50}'::jsonb, 'S-1g: 保存し直したあとも達成行と達成値は残る');

select throws_ok(
  $$ insert into public.milestone_achievements (milestone_id, practice_log_id, record_id, achieved_value)
     select '27276000-0000-4000-a000-000000000001', pl.id, '27274000-0000-4000-a000-000000000002', '{}'
     from public.practice_logs pl
     where pl.practice_id = '27272000-0000-4000-a000-000000000002' $$,
  '23514', null, 'S-1f: 練習ログと記録の両方を根拠にした達成行は作れない');

-- =============================================================================
-- S-2 Google のリフレッシュトークン
-- =============================================================================
select hasnt_column('public', 'users', 'google_calendar_refresh_token',
  'S-2a: users にトークン列は無い (チームメイトに行が見えても列が無い)');

select public.qa_login_as('27270000-0000-4000-a000-000000000001');
select lives_ok(
  $$ select public.set_google_refresh_token('27270000-0000-4000-a000-000000000001', 'QA_SR_ENCRYPTED') $$,
  'S-2b: 本人は RPC でトークンを保存できる');
select is(
  public.get_google_refresh_token('27270000-0000-4000-a000-000000000001'),
  'QA_SR_ENCRYPTED', 'S-2c: 本人は RPC でトークンを読める');
select public.qa_logout();

select public.qa_login_as('27270000-0000-4000-a000-000000000002');
select throws_ok(
  $$ select google_calendar_refresh_token from public.user_secrets $$,
  '42501', null, 'S-2d: チームメイトは user_secrets を直接読めない');
select throws_ok(
  $$ select public.get_google_refresh_token('27270000-0000-4000-a000-000000000001') $$,
  'P0001', '自分のトークンのみ取得可能です', 'S-2e: チームメイトは RPC でも他人のトークンを読めない');
select public.qa_logout();

select ok(not has_function_privilege('anon', 'public.get_google_refresh_token(uuid)', 'EXECUTE'),
  'S-2f: anon は get_google_refresh_token を実行できない');
select ok(not has_function_privilege('anon', 'public.set_google_refresh_token(uuid, text)', 'EXECUTE'),
  'S-2g: anon は set_google_refresh_token を実行できない');

select public.qa_login_as('27270000-0000-4000-a000-000000000001');
select public.set_google_refresh_token('27270000-0000-4000-a000-000000000001', null);
select public.qa_logout();
select is(
  (select count(*)::int from public.user_secrets where user_id = '27270000-0000-4000-a000-000000000001'),
  0, 'S-2h: 連携解除 (NULL を保存) でトークンの行が消える');

-- =============================================================================
-- S-3 練習・大会の持ち主
-- =============================================================================
select throws_ok(
  $$ insert into public.competitions (user_id, team_id, date) values (null, null, '2026-11-01') $$,
  '23514', null, 'S-3a: 持ち主のいない大会は作れない');
-- 練習には持ち主の CHECK を付けない: チーム削除はチーム練習を残し、他のメンバーのログを守る
select public.qa_login_as('27270000-0000-4000-a000-000000000002');
select is(
  (public.delete_team_preserving_records('27271000-0000-4000-a000-000000000003')->>'success')::boolean,
  true, 'S-3b: 作成者が退会済みのチーム練習があるチームも削除できる');
select public.qa_logout();
select is(
  (select count(*)::int from public.practice_logs pl join public.practices p on p.id = pl.practice_id
   where pl.id = '27273000-0000-4000-a000-000000000003' and p.team_id is null and p.user_id is null),
  1, 'S-3b2: チーム削除後も練習とメンバーのログは残る');

-- ...13 は元チーム練習 (チーム削除で leaver の個人練習になった) で、owner のログが付いている
insert into public.practices (id, user_id, team_id, date) values
  ('27272000-0000-4000-a000-000000000011', '27270000-0000-4000-a000-000000000004', null, '2026-11-03'),
  ('27272000-0000-4000-a000-000000000012', '27270000-0000-4000-a000-000000000004', '27271000-0000-4000-a000-000000000001', '2026-11-03'),
  ('27272000-0000-4000-a000-000000000013', '27270000-0000-4000-a000-000000000004', null, '2026-11-03');
-- ...11 には本人 (leaver) のログだけ、...13 には他のメンバー (owner) のログ
insert into public.practice_logs (id, user_id, practice_id, style, rep_count, set_count, distance) values
  ('27273000-0000-4000-a000-000000000011', '27270000-0000-4000-a000-000000000004', '27272000-0000-4000-a000-000000000011', 'Fr', 1, 1, 50),
  ('27273000-0000-4000-a000-000000000013', '27270000-0000-4000-a000-000000000001', '27272000-0000-4000-a000-000000000013', 'Fr', 1, 1, 50);
insert into public.competitions (id, user_id, team_id, date) values
  ('27278000-0000-4000-a000-000000000011', '27270000-0000-4000-a000-000000000004', null, '2026-11-03');

select lives_ok(
  $$ delete from auth.users where id = '27270000-0000-4000-a000-000000000004' $$,
  'S-3c: 個人の練習・大会を持つユーザーを (退会 API を通さずに) 削除できる');
select is(
  (select count(*)::int from public.practices where id = '27272000-0000-4000-a000-000000000011'),
  0, 'S-3d: 削除したユーザーの個人練習 (本人のログだけが付いたもの) は消える');
select is(
  (select count(*)::int from public.competitions where id = '27278000-0000-4000-a000-000000000011'),
  0, 'S-3e: 削除したユーザーの個人大会は消える');
select is(
  (select count(*)::int from public.practices
   where id = '27272000-0000-4000-a000-000000000012' and user_id is null),
  1, 'S-3f: チーム練習は残り、user_id が NULL になる');
select is(
  (select count(*)::int from public.practices
   where id = '27272000-0000-4000-a000-000000000013' and user_id is null),
  1, 'S-3k: 他のメンバーのログが付いた個人練習 (元チーム練習) は消さずに残り、持ち主が NULL になる');
select is(
  (select count(*)::int from public.practice_logs where id = '27273000-0000-4000-a000-000000000013'),
  1, 'S-3l: その練習に付いた他のメンバーのログは残る');

select lives_ok(
  $$ delete from auth.users where id = '27270000-0000-4000-a000-000000000003' $$,
  'S-3g: チームを作ったユーザーを削除できる (旧: enforce_teams_identity_immutable に拒否された)');
select is(
  (select created_by from public.teams where id = '27271000-0000-4000-a000-000000000001'),
  null, 'S-3h: チームは残り、created_by が NULL になる');
select throws_ok(
  $$ update public.teams set created_by = null where id = '27271000-0000-4000-a000-000000000002' $$,
  'P0001', 'チームの作成者は変更できません', 'S-3i: 作成者がいる間は created_by を NULL にできない');

-- 作成者 (owner) は T4 を抜けていて admin4 とはチームが重ならないので、admin4 からは owner の users 行が見えない。
-- それでも「作成者が存在しない」と誤認しない (トリガが RLS に左右されない)
select public.qa_login_as('27270000-0000-4000-a000-000000000005');
select throws_ok(
  $$ update public.teams set created_by = null where id = '27271000-0000-4000-a000-000000000004' $$,
  'P0001', 'チームの作成者は変更できません',
  'S-3j: 作成者が見えない管理者でも created_by を NULL にできない');
select public.qa_logout();

-- =============================================================================
-- S-4 team_memberships.is_active
-- =============================================================================
select throws_ok(
  $$ insert into public.team_memberships (team_id, user_id, role, status, is_active)
     values ('27271000-0000-4000-a000-000000000002', '27270000-0000-4000-a000-000000000001', 'user', 'pending', true) $$,
  '23514', null, 'S-4a: pending なのに is_active=true の行は作れない');
select throws_ok(
  $$ update public.team_memberships set is_active = false
     where team_id = '27271000-0000-4000-a000-000000000001' and user_id = '27270000-0000-4000-a000-000000000001' $$,
  '23514', null, 'S-4b: left_at を入れずに is_active だけを false にはできない');
select col_not_null('public', 'team_memberships', 'is_active', 'S-4c: is_active は NOT NULL');

-- =============================================================================
-- S-5 種目マスタ
-- =============================================================================
select throws_ok(
  $$ delete from public.styles where id = (select style_id from public.goals where id = '27275000-0000-4000-a000-000000000001') $$,
  '23503', null, 'S-5a: 参照されている種目マスタは削除できない (旧: 記録・エントリーが連鎖で消えた)');

-- =============================================================================
-- S-6 不要なテーブル・列とテンプレートのタグ
-- =============================================================================
select hasnt_table('public', 'user_sessions', 'S-6a: user_sessions は無い');
select hasnt_column('public', 'practice_log_tags', 'updated_at', 'S-6b: practice_log_tags.updated_at は無い');

insert into public.practice_tags (id, user_id, name) values
  ('27279000-0000-4000-a000-000000000001', '27270000-0000-4000-a000-000000000001', 'QA SR tag1'),
  ('27279000-0000-4000-a000-000000000002', '27270000-0000-4000-a000-000000000001', 'QA SR tag2');
insert into public.practice_log_templates (id, user_id, name, style, tag_ids) values
  ('2727a000-0000-4000-a000-000000000001', '27270000-0000-4000-a000-000000000001', 'QA SR tpl', 'Fr',
   array['27279000-0000-4000-a000-000000000001', '27279000-0000-4000-a000-000000000002']::uuid[]);
delete from public.practice_tags where id = '27279000-0000-4000-a000-000000000001';
select is(
  (select tag_ids from public.practice_log_templates where id = '2727a000-0000-4000-a000-000000000001'),
  array['27279000-0000-4000-a000-000000000002']::uuid[],
  'S-6c: タグを削除するとテンプレートの tag_ids から外れ、他のタグは残る');

-- =============================================================================
-- S-7 列の型
-- =============================================================================
select col_type_is('public', 'competitions', 'pool_type', 'smallint', 'S-7a: competitions.pool_type は smallint');
select col_type_is('public', 'practice_log_templates', 'swim_category', 'swim_category_enum',
  'S-7b: テンプレートの swim_category は practice_logs と同じ enum');
select col_type_is('public', 'practice_log_templates', 'circle', 'numeric(10,2)',
  'S-7c: テンプレートの circle は practice_logs と同じ numeric(10,2)');

-- =============================================================================
-- S-8 インデックス・ポリシー・関数の権限
-- =============================================================================
select hasnt_index('public', 'app_daily_usage', 'idx_app_daily_usage_lookup',
  'S-8a: UNIQUE と同じ列の重複インデックスは無い');
select has_index('public', 'competitions', 'idx_competitions_created_by',
  'S-8b: 外部キー competitions.created_by にインデックスがある');
select ok(
  (select qual from pg_policies
   where tablename = 'practice_log_templates' and policyname = 'Users can manage own templates')
  ilike '%SELECT auth.uid()%',
  'S-8c: テンプレートのポリシーは (SELECT auth.uid()) で1回だけ評価する');
select ok(
  (select 'search_path=public' = any (proconfig) from pg_proc where oid = 'public.update_updated_at_column()'::regprocedure),
  'S-8d: update_updated_at_column の search_path が固定されている');
select ok(
  not has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'),
  'S-8e: handle_new_user (トリガ専用) は API ロールから実行できない');
select ok(has_function_privilege('authenticated', 'public.get_google_refresh_token(uuid)', 'EXECUTE'),
  'S-8f: authenticated は get_google_refresh_token を実行できる (権限を外しすぎていない)');

-- =============================================================================
-- S-9 provider の綴り
-- =============================================================================
insert into public.user_subscriptions (id, plan, provider)
values ('27270000-0000-4000-a000-000000000002', 'premium', 'revenucat')
on conflict (id) do update set provider = excluded.provider;
select is(
  (select provider from public.user_subscriptions where id = '27270000-0000-4000-a000-000000000002'),
  'revenuecat', 'S-9a: 旧綴り revenucat で書き込んでも revenuecat で保存される (timer の Webhook 移行用)');
select throws_ok(
  $$ update public.user_subscriptions set provider = 'revenu' where id = '27270000-0000-4000-a000-000000000002' $$,
  '23514', null, 'S-9b: stripe / revenuecat 以外の provider は書けない');

select * from finish();
rollback;
