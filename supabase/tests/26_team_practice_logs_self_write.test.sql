-- =============================================================================
-- pgTAP: チーム練習のログは「本人の分だけ書ける・管理者は代理入力できる」
--        チーム練習・チーム大会の作成は管理者だけ
--        (20261130000000_team_practice_logs_self_write.sql / ryuuhei0729/swimhub-tasks#139)
--
-- 観点:
--   S-01〜04: 一般メンバーは、管理者が作ったチーム練習に自分のログを追加・更新・削除でき、
--             自分のログにタイム・タグを付けられる
--   S-05〜10: 一般メンバーは、他のメンバーのログ (とそのタイム・タグ) を追加・更新・削除できない
--   S-11〜12: 管理者は、メンバーのログを代理で追加・更新できる (チーム外の人の分は不可)
--   S-13:     チームのメンバーでない人は、チーム練習にログを付けられない
--   S-14:     自分のログを、自分がメンバーでないチームの練習へ付け替えられない
--   S-15:     メンバーが作ったチーム練習 (修正前の web で作られたもの) でも、
--             作成者は他のメンバーのログを消せない
--   S-16〜17: 個人練習は従来どおり持ち主だけが書ける
--   S-18〜21: チーム練習・チーム大会を作れるのは管理者だけ (個人の練習・大会は従来どおり)
--   S-22:     他のメンバーのログは読める (SELECT は変えていない)
--
-- 実行: ローカル Supabase (migration 適用済み) で `supabase test db`。フィクスチャは rollback で消える。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

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
--   admin    : team1 の管理者 (チーム練習 p_team の作成者)
--   m1, m2   : team1 の一般メンバー
--   outsider : どのチームにも入っていない
--   team2    : m1 が入っていない別チーム (付け替え先)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('c2600000-0000-4000-a000-000000000001', 'qa-selfwrite-admin@example.test'),
  ('c2600000-0000-4000-a000-000000000002', 'qa-selfwrite-m1@example.test'),
  ('c2600000-0000-4000-a000-000000000003', 'qa-selfwrite-m2@example.test'),
  ('c2600000-0000-4000-a000-000000000004', 'qa-selfwrite-outsider@example.test');

insert into public.users (id, name)
select id, email from auth.users
where email like 'qa-selfwrite-%@example.test'
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('d2600000-0000-4000-a000-000000000001', 'QA SelfWrite Team1', 'QA-SELFW-T1',
   'c2600000-0000-4000-a000-000000000001'),
  ('d2600000-0000-4000-a000-000000000002', 'QA SelfWrite Team2', 'QA-SELFW-T2',
   'c2600000-0000-4000-a000-000000000001');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at) values
  ('d2600000-0000-4000-a000-000000000001', 'c2600000-0000-4000-a000-000000000001', 'admin', 'approved', true, '2026-01-01'),
  ('d2600000-0000-4000-a000-000000000001', 'c2600000-0000-4000-a000-000000000002', 'user',  'approved', true, '2026-01-01'),
  ('d2600000-0000-4000-a000-000000000001', 'c2600000-0000-4000-a000-000000000003', 'user',  'approved', true, '2026-01-01'),
  ('d2600000-0000-4000-a000-000000000002', 'c2600000-0000-4000-a000-000000000001', 'admin', 'approved', true, '2026-01-01');

-- 練習: p_team (admin 作成のチーム練習) / p_team2 (team2 のチーム練習)
--       p_legacy (m1 が作ったチーム練習) / p_personal (m1 の個人練習)
insert into public.practices (id, user_id, team_id, title, date) values
  ('e2600000-0000-4000-a000-000000000001', 'c2600000-0000-4000-a000-000000000001',
   'd2600000-0000-4000-a000-000000000001', 'QA チーム練習', '2026-11-20'),
  ('e2600000-0000-4000-a000-000000000002', 'c2600000-0000-4000-a000-000000000001',
   'd2600000-0000-4000-a000-000000000002', 'QA team2 の練習', '2026-11-20'),
  ('e2600000-0000-4000-a000-000000000003', 'c2600000-0000-4000-a000-000000000002',
   'd2600000-0000-4000-a000-000000000001', 'QA メンバーが作ったチーム練習', '2026-11-21'),
  ('e2600000-0000-4000-a000-000000000004', 'c2600000-0000-4000-a000-000000000002',
   null, 'QA m1 の個人練習', '2026-11-22');

-- m2 のログ: p_team 上 (log_m2) と p_legacy 上 (log_m2_legacy)。m2 のタイム・タグも付けておく
insert into public.practice_logs (id, user_id, practice_id, style, rep_count, set_count, distance) values
  ('f2600000-0000-4000-a000-000000000002', 'c2600000-0000-4000-a000-000000000003',
   'e2600000-0000-4000-a000-000000000001', 'Fr', 4, 1, 100),
  ('f2600000-0000-4000-a000-000000000003', 'c2600000-0000-4000-a000-000000000003',
   'e2600000-0000-4000-a000-000000000003', 'Fr', 4, 1, 100);

insert into public.practice_times (id, user_id, practice_log_id, rep_number, set_number, time) values
  ('a2600000-0000-4000-a000-000000000002', 'c2600000-0000-4000-a000-000000000003',
   'f2600000-0000-4000-a000-000000000002', 1, 1, 70.00);

insert into public.practice_tags (id, user_id, name) values
  ('b2600000-0000-4000-a000-000000000002', 'c2600000-0000-4000-a000-000000000002', 'QA m1 のタグ'),
  ('b2600000-0000-4000-a000-000000000003', 'c2600000-0000-4000-a000-000000000003', 'QA m2 のタグ');

insert into public.practice_log_tags (practice_log_id, practice_tag_id) values
  ('f2600000-0000-4000-a000-000000000002', 'b2600000-0000-4000-a000-000000000003');

-- -----------------------------------------------------------------------------
-- 一般メンバー m1: 自分のログは書ける
-- -----------------------------------------------------------------------------
select public.qa_login_as('c2600000-0000-4000-a000-000000000002');

select lives_ok($$
  insert into public.practice_logs (id, user_id, practice_id, style, rep_count, set_count, distance)
  values ('f2600000-0000-4000-a000-000000000001', 'c2600000-0000-4000-a000-000000000002',
          'e2600000-0000-4000-a000-000000000001', 'Fr', 4, 1, 100)
$$, 'S-01: メンバーは管理者が作ったチーム練習に自分のログを追加できる');

update public.practice_logs set distance = 50 where id = 'f2600000-0000-4000-a000-000000000001';
select is(
  (select distance from public.practice_logs where id = 'f2600000-0000-4000-a000-000000000001'),
  50, 'S-02: メンバーは自分のログを更新できる');

select lives_ok($$
  insert into public.practice_times (user_id, practice_log_id, rep_number, set_number, time)
  values ('c2600000-0000-4000-a000-000000000002', 'f2600000-0000-4000-a000-000000000001', 1, 1, 65.00)
$$, 'S-03: メンバーは自分のログにタイムを付けられる');

select lives_ok($$
  insert into public.practice_log_tags (practice_log_id, practice_tag_id)
  values ('f2600000-0000-4000-a000-000000000001', 'b2600000-0000-4000-a000-000000000002')
$$, 'S-04: メンバーは自分のログにタグを付けられる');

-- -----------------------------------------------------------------------------
-- 一般メンバー m1: 他のメンバー (m2) の分は書けない
-- -----------------------------------------------------------------------------
select throws_ok($$
  insert into public.practice_logs (user_id, practice_id, style, rep_count, set_count, distance)
  values ('c2600000-0000-4000-a000-000000000003', 'e2600000-0000-4000-a000-000000000001', 'Fr', 4, 1, 100)
$$, '42501', null, 'S-05: メンバーは他のメンバーを持ち主とするログを追加できない');

update public.practice_logs set distance = 25 where id = 'f2600000-0000-4000-a000-000000000002';
delete from public.practice_logs where id = 'f2600000-0000-4000-a000-000000000002';

select throws_ok($$
  insert into public.practice_times (user_id, practice_log_id, rep_number, set_number, time)
  values ('c2600000-0000-4000-a000-000000000002', 'f2600000-0000-4000-a000-000000000002', 2, 1, 60.00)
$$, '42501', null, 'S-08: メンバーは他のメンバーのログにタイムを足せない');

update public.practice_times set time = 1.00 where id = 'a2600000-0000-4000-a000-000000000002';
delete from public.practice_log_tags where practice_log_id = 'f2600000-0000-4000-a000-000000000002';

select throws_ok($$
  update public.practice_logs set practice_id = 'e2600000-0000-4000-a000-000000000002'
  where id = 'f2600000-0000-4000-a000-000000000001'
$$, '42501', null, 'S-14: 自分のログを、メンバーでないチームの練習へ付け替えられない');

delete from public.practice_logs where id = 'f2600000-0000-4000-a000-000000000003';

select public.qa_logout();

-- m1 の更新・削除が m2 の行に効いていないこと (postgres で確認)
select is(
  (select distance from public.practice_logs where id = 'f2600000-0000-4000-a000-000000000002'),
  100, 'S-06: メンバーは他のメンバーのログを更新できない (0 行)');
select is(
  (select count(*)::int from public.practice_logs where id = 'f2600000-0000-4000-a000-000000000002'),
  1, 'S-07: メンバーは他のメンバーのログを削除できない (0 行)');
select is(
  (select time from public.practice_times where id = 'a2600000-0000-4000-a000-000000000002'),
  70.00::numeric, 'S-09: メンバーは他のメンバーのタイムを更新できない (0 行)');
select is(
  (select count(*)::int from public.practice_log_tags where practice_log_id = 'f2600000-0000-4000-a000-000000000002'),
  1, 'S-10: メンバーは他のメンバーのログのタグを外せない (0 行)');
select is(
  (select count(*)::int from public.practice_logs where id = 'f2600000-0000-4000-a000-000000000003'),
  1, 'S-15: メンバーが作ったチーム練習でも、作成者は他のメンバーのログを消せない');

-- -----------------------------------------------------------------------------
-- 管理者: 代理入力
-- -----------------------------------------------------------------------------
select public.qa_login_as('c2600000-0000-4000-a000-000000000001');

select lives_ok($$
  insert into public.practice_logs (user_id, practice_id, style, rep_count, set_count, distance)
  values ('c2600000-0000-4000-a000-000000000003', 'e2600000-0000-4000-a000-000000000001', 'Ba', 2, 1, 50)
$$, 'S-11: 管理者はメンバーのログを代理で追加できる');

select throws_ok($$
  insert into public.practice_logs (user_id, practice_id, style, rep_count, set_count, distance)
  values ('c2600000-0000-4000-a000-000000000004', 'e2600000-0000-4000-a000-000000000001', 'Fr', 4, 1, 100)
$$, '42501', null, 'S-12: 管理者でも、チーム外の人を持ち主とするログは追加できない');

select lives_ok($$
  insert into public.practices (user_id, team_id, title, date)
  values ('c2600000-0000-4000-a000-000000000001', 'd2600000-0000-4000-a000-000000000001', 'QA 管理者が作る練習', '2026-11-25')
$$, 'S-19: 管理者はチーム練習を作れる');

select lives_ok($$
  insert into public.competitions (user_id, team_id, title, date)
  values ('c2600000-0000-4000-a000-000000000001', 'd2600000-0000-4000-a000-000000000001', 'QA 管理者が作る大会', '2026-12-01')
$$, 'S-21: 管理者はチーム大会を作れる');

select public.qa_logout();

-- -----------------------------------------------------------------------------
-- チーム外の人
-- -----------------------------------------------------------------------------
select public.qa_login_as('c2600000-0000-4000-a000-000000000004');
select throws_ok($$
  insert into public.practice_logs (user_id, practice_id, style, rep_count, set_count, distance)
  values ('c2600000-0000-4000-a000-000000000004', 'e2600000-0000-4000-a000-000000000001', 'Fr', 4, 1, 100)
$$, '42501', null, 'S-13: チームのメンバーでない人は、チーム練習にログを付けられない');
select public.qa_logout();

-- -----------------------------------------------------------------------------
-- 個人練習 / チーム練習・大会の作成
-- -----------------------------------------------------------------------------
select public.qa_login_as('c2600000-0000-4000-a000-000000000002');
select lives_ok($$
  insert into public.practice_logs (user_id, practice_id, style, rep_count, set_count, distance)
  values ('c2600000-0000-4000-a000-000000000002', 'e2600000-0000-4000-a000-000000000004', 'Fr', 4, 1, 100)
$$, 'S-16: 個人練習の持ち主はログを追加できる');

select throws_ok($$
  insert into public.practices (user_id, team_id, title, date)
  values ('c2600000-0000-4000-a000-000000000002', 'd2600000-0000-4000-a000-000000000001', 'QA メンバーが作る練習', '2026-11-25')
$$, '42501', null, 'S-18: 一般メンバーはチーム練習を作れない');

select throws_ok($$
  insert into public.competitions (user_id, team_id, title, date)
  values ('c2600000-0000-4000-a000-000000000002', 'd2600000-0000-4000-a000-000000000001', 'QA メンバーが作る大会', '2026-12-01')
$$, '42501', null, 'S-20: 一般メンバーはチーム大会を作れない');

select lives_ok($$
  insert into public.practices (user_id, team_id, title, date)
  values ('c2600000-0000-4000-a000-000000000002', null, 'QA m1 の新しい個人練習', '2026-11-26')
$$, 'S-18b: 個人練習は従来どおり作れる');

select is(
  (select count(*)::int from public.practice_logs where id = 'f2600000-0000-4000-a000-000000000002'),
  1, 'S-22: メンバーは他のメンバーのログを読める');
select public.qa_logout();

select public.qa_login_as('c2600000-0000-4000-a000-000000000003');
select throws_ok($$
  insert into public.practice_logs (user_id, practice_id, style, rep_count, set_count, distance)
  values ('c2600000-0000-4000-a000-000000000003', 'e2600000-0000-4000-a000-000000000004', 'Fr', 4, 1, 100)
$$, '42501', null, 'S-17: 他人の個人練習にはログを付けられない');
select public.qa_logout();

select * from finish();
rollback;
