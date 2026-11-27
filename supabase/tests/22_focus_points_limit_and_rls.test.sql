-- =============================================================================
-- pgTAP: focus_points の上限トリガー・mastered_at・RLS・テーブル権限
-- =============================================================================
-- 対象 migration: 20261126000000_add_focus_points.sql
--
-- 固定すること:
--   A. 取り組み中 (active) は1ユーザー3つまで。4つ目の INSERT と、3つあるときの
--      mastered → active の戻しは focus_point_limit_exceeded (P0001) で止まる。
--      active のままのタイトル編集は数え直さずに通る。
--   B. mastered_at は DB が入れる (mastered にした時点で now()、active に戻すと NULL)。
--      状態と食い違う値は CHECK で拒否される。
--   C. RLS: 他人の行は見えず、他人の user_id で追加できず、他人の行を書き換え・削除できない。
--      自分の行の user_id を他人に付け替えることもできない。
--   D. 権限: authenticated に TRUNCATE が無い (RLS が効かない操作)。anon は何もできない。
--
-- 実行: ローカル Supabase 起動済み・対象 migration 適用済みの状態で直接 `psql -f`
--       実行する (16番と同じ)。全フィクスチャは begin;...rollback; で消える。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

-- -----------------------------------------------------------------------------
-- ヘルパー: JWT クレーム + ロール切替 (16番と同一定義。rollback で消える)
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
-- フィクスチャ (postgres = BYPASSRLS で投入)
--   user_a: f0c05000-...-0001 (上限・mastered_at を試す本人)
--   user_b: f0c05000-...-0002 (他人。user_a の行に触れないことを確かめる)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('f0c05000-0000-4000-a000-000000000001', 'qa-fp-user-a@example.test'),
  ('f0c05000-0000-4000-a000-000000000002', 'qa-fp-user-b@example.test');

insert into public.users (id, name)
select id, email from auth.users
where id in ('f0c05000-0000-4000-a000-000000000001', 'f0c05000-0000-4000-a000-000000000002')
on conflict (id) do nothing;

-- user_b の行 (user_a から触れないことの確認用)
insert into public.focus_points (id, user_id, title)
values ('f0c05000-0000-4000-b000-0000000000b1', 'f0c05000-0000-4000-a000-000000000002', 'QA-FP user_b の行');

-- =============================================================================
-- D. テーブル権限
-- =============================================================================
select ok(
  not has_table_privilege('authenticated', 'public.focus_points', 'TRUNCATE'),
  'D-1: authenticated に TRUNCATE が無い (RLS の効かない全消しを防ぐ)');

select ok(
  has_table_privilege('authenticated', 'public.focus_points', 'SELECT, INSERT, UPDATE, DELETE'),
  'D-2: authenticated には SELECT / INSERT / UPDATE / DELETE がある');

select ok(
  not has_table_privilege('anon', 'public.focus_points', 'SELECT')
    and not has_table_privilege('anon', 'public.focus_points', 'INSERT'),
  'D-3: anon は読めず追加もできない');

-- =============================================================================
-- A. 取り組み中は3つまで
-- =============================================================================
select public.qa_login_as('f0c05000-0000-4000-a000-000000000001'); -- user_a

select lives_ok(
  $$ insert into public.focus_points (id, user_id, title) values
       ('f0c05000-0000-4000-b000-0000000000a1', auth.uid(), 'QA-FP 1'),
       ('f0c05000-0000-4000-b000-0000000000a2', auth.uid(), 'QA-FP 2'),
       ('f0c05000-0000-4000-b000-0000000000a3', auth.uid(), 'QA-FP 3') $$,
  'A-1: 取り組み中を3つまでは追加できる');

select throws_ok(
  $$ insert into public.focus_points (user_id, title) values (auth.uid(), 'QA-FP 4') $$,
  'P0001', 'focus_point_limit_exceeded',
  'A-2: 4つ目の追加は focus_point_limit_exceeded で止まる');

select lives_ok(
  $$ update public.focus_points set title = 'QA-FP 1 (編集)'
     where id = 'f0c05000-0000-4000-b000-0000000000a1' $$,
  'A-3: 3つあっても、取り組み中のタイトル・メモの編集は通る');

select lives_ok(
  $$ update public.focus_points set status = 'mastered'
     where id = 'f0c05000-0000-4000-b000-0000000000a3' $$,
  'A-4: 「身についた」にできる');

select lives_ok(
  $$ insert into public.focus_points (id, user_id, title)
     values ('f0c05000-0000-4000-b000-0000000000a4', auth.uid(), 'QA-FP 4') $$,
  'A-5: 1つ身についたら、新しく追加できる');

select throws_ok(
  $$ update public.focus_points set status = 'active'
     where id = 'f0c05000-0000-4000-b000-0000000000a3' $$,
  'P0001', 'focus_point_limit_exceeded',
  'A-6: 取り組み中が3つあるときに、身についたものを取り組み中に戻すと止まる');

-- =============================================================================
-- B. mastered_at
-- =============================================================================
select isnt(
  (select mastered_at from public.focus_points where id = 'f0c05000-0000-4000-b000-0000000000a3'),
  null,
  'B-1: 「身についた」にすると mastered_at が DB で入る (アプリは status だけ送る)');

select lives_ok(
  $$ update public.focus_points set status = 'mastered', mastered_at = '2000-01-01T00:00:00Z'
     where id = 'f0c05000-0000-4000-b000-0000000000a2' $$,
  'B-2: mastered にする UPDATE は通る');

select isnt(
  (select mastered_at from public.focus_points where id = 'f0c05000-0000-4000-b000-0000000000a2'),
  '2000-01-01T00:00:00Z'::timestamptz,
  'B-3: 端末から送られた mastered_at ではなく DB の時刻が入る');

select lives_ok(
  $$ update public.focus_points set status = 'active'
     where id = 'f0c05000-0000-4000-b000-0000000000a3' $$,
  'B-4: 空きがあれば、身についたものを取り組み中に戻せる');

select is(
  (select mastered_at from public.focus_points where id = 'f0c05000-0000-4000-b000-0000000000a3'),
  null,
  'B-5: 取り組み中に戻すと mastered_at は消える');

select throws_ok(
  $$ update public.focus_points set mastered_at = now()
     where id = 'f0c05000-0000-4000-b000-0000000000a1' $$,
  '23514', null,
  'B-6: 取り組み中の行に mastered_at だけ入れることは CHECK で拒否される');

select throws_ok(
  $$ insert into public.focus_points (user_id, title, status) values (auth.uid(), '   ', 'mastered') $$,
  '23514', null,
  'B-7: 空白だけのタイトルは CHECK で拒否される');

-- =============================================================================
-- C. RLS
-- =============================================================================
select is(
  (select count(*)::integer from public.focus_points where user_id <> auth.uid()),
  0,
  'C-1: 他人 (user_b) の行は見えない');

select throws_ok(
  $$ insert into public.focus_points (user_id, title)
     values ('f0c05000-0000-4000-a000-000000000002', 'QA-FP なりすまし') $$,
  '42501', null,
  'C-2: 他人の user_id では追加できない');

select throws_ok(
  $$ update public.focus_points set user_id = 'f0c05000-0000-4000-a000-000000000002'
     where id = 'f0c05000-0000-4000-b000-0000000000a1' $$,
  '42501', null,
  'C-3: 自分の行の user_id を他人に付け替えられない');

select lives_ok(
  $$ update public.focus_points set title = 'QA-FP 乗っ取り'
     where id = 'f0c05000-0000-4000-b000-0000000000b1' $$,
  'C-4: 他人の行への UPDATE はエラーにはならず 0 行で終わる');

select lives_ok(
  $$ delete from public.focus_points where id = 'f0c05000-0000-4000-b000-0000000000b1' $$,
  'C-5: 他人の行への DELETE もエラーにはならず 0 行で終わる');

select public.qa_logout();

select is(
  (select title from public.focus_points where id = 'f0c05000-0000-4000-b000-0000000000b1'),
  'QA-FP user_b の行',
  'C-6: user_b の行は書き換えも削除もされていない (C-4 / C-5 の裏取り)');

select is(
  (select count(*)::integer from public.focus_points
   where user_id = 'f0c05000-0000-4000-a000-000000000001' and status = 'active'),
  3,
  'C-7: 一連の操作のあと、user_a の取り組み中はちょうど3つ');

select * from finish();
rollback;
