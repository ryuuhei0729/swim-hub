-- =============================================================================
-- pgTAP: get_team_member_focus_points (管理者がメンバーのフォーカスポイントを見る RPC)
-- =============================================================================
-- 対象 migration: 20261127000000_get_team_member_focus_points_rpc.sql
--
-- 固定すること:
--   A. 承認済み・アクティブな管理者は、同じチームの承認済み・アクティブなメンバーの
--      フォーカスポイントを、取り組み中 (追加順) → 身についた (新しい順) の並びで読める
--   B. 呼び出し元の拒否: 未ログイン / anon / 一般メンバー / 承認待ちの管理者 /
--      非アクティブな管理者 / 別チームの管理者
--   C. 対象の拒否: 承認待ち・非アクティブ・チーム外のメンバー
--   D. 返す列は表示に要るものだけ (user_id を返さない)
--
-- 実行: ローカル Supabase 起動済み・対象 migration 適用済みの状態で直接 `psql -f`
--       実行する (16・18番と同じ)。全フィクスチャは begin;...rollback; で消える。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

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
-- フィクスチャ (postgres = BYPASSRLS で投入)
--   team1: admin=f1 (承認済み・アクティブ), f2 (承認待ち管理者), f3 (非アクティブ管理者),
--          member=f4 (対象), f5 (承認待ち), f6 (非アクティブ), f7 (一般メンバー=呼び出し元として拒否)
--   team2: admin=f8 (別チームの管理者), member=f9 (チーム外の対象)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email)
select ('f0c05100-0000-4000-a000-0000000000' || suffix)::uuid, 'qa-mfp-' || suffix || '@example.test'
from (values ('f1'),('f2'),('f3'),('f4'),('f5'),('f6'),('f7'),('f8'),('f9')) v(suffix);

insert into public.users (id, name)
select id, email from auth.users where email like 'qa-mfp-%@example.test'
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('f0c05200-0000-4000-a000-000000000001', 'QA MFP Team1', 'QA-MFP-T1-CODE', 'f0c05100-0000-4000-a000-0000000000f1'),
  ('f0c05200-0000-4000-a000-000000000002', 'QA MFP Team2', 'QA-MFP-T2-CODE', 'f0c05100-0000-4000-a000-0000000000f8');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at, left_at) values
  ('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f1', 'admin', 'approved', true,  '2026-01-01', null),
  ('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f2', 'admin', 'pending',  false, '2026-01-01', null),
  ('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f3', 'admin', 'approved', false, '2026-01-01', '2026-06-01'),
  ('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f4', 'user',  'approved', true,  '2026-01-01', null),
  ('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f5', 'user',  'pending',  false, '2026-01-01', null),
  ('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f6', 'user',  'approved', false, '2026-01-01', '2026-06-01'),
  ('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f7', 'user',  'approved', true,  '2026-01-01', null),
  ('f0c05200-0000-4000-a000-000000000002', 'f0c05100-0000-4000-a000-0000000000f8', 'admin', 'approved', true,  '2026-01-01', null),
  ('f0c05200-0000-4000-a000-000000000002', 'f0c05100-0000-4000-a000-0000000000f9', 'user',  'approved', true,  '2026-01-01', null);

-- 対象 f4 のフォーカスポイント: 取り組み中2つ (追加順 b → a)、身についた2つ (新しい順 m2 → m1)
insert into public.focus_points (id, user_id, title, note, status, created_at) values
  ('f0c05300-0000-4000-a000-0000000000a1', 'f0c05100-0000-4000-a000-0000000000f4', 'QA-FP active A', 'メモA', 'active', '2026-11-02'),
  ('f0c05300-0000-4000-a000-0000000000b1', 'f0c05100-0000-4000-a000-0000000000f4', 'QA-FP active B', null,    'active', '2026-11-01'),
  ('f0c05300-0000-4000-a000-0000000000c1', 'f0c05100-0000-4000-a000-0000000000f4', 'QA-FP mastered 1', null, 'mastered', '2026-08-01'),
  ('f0c05300-0000-4000-a000-0000000000c2', 'f0c05100-0000-4000-a000-0000000000f4', 'QA-FP mastered 2', null, 'mastered', '2026-08-02');
-- mastered_at はトリガーが now() で入れるので、並びの確認用に直接書き換える
-- (トリガーは UPDATE OF status のときだけ動くので、mastered_at だけの UPDATE はそのまま入る)
update public.focus_points set mastered_at = '2026-09-01' where id = 'f0c05300-0000-4000-a000-0000000000c1';
update public.focus_points set mastered_at = '2026-10-01' where id = 'f0c05300-0000-4000-a000-0000000000c2';

-- =============================================================================
-- A. 管理者は読める・並び
-- =============================================================================
select public.qa_login_as('f0c05100-0000-4000-a000-0000000000f1');

select is(
  array(
    select title
    from public.get_team_member_focus_points('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f4')
  ),
  array['QA-FP active B', 'QA-FP active A', 'QA-FP mastered 2', 'QA-FP mastered 1'],
  'A-1: 管理者はメンバーのフォーカスポイントを、取り組み中 (追加順) → 身についた (新しい順) で読める');

select is(
  (select note from public.get_team_member_focus_points('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f4')
   where title = 'QA-FP active A'),
  'メモA',
  'A-2: メモも読める');

select is(
  (select count(*)::integer from public.get_team_member_focus_points('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f7')),
  0,
  'A-3: フォーカスポイントの無いメンバーは 0 件 (エラーにはしない)');

-- =============================================================================
-- D. 返す列
-- =============================================================================
select ok(
  not exists (
    select 1 from information_schema.parameters
    where specific_name like 'get_team_member_focus_points%'
      and parameter_mode = 'OUT' and parameter_name = 'user_id'
  ),
  'D-1: user_id は返さない');

-- =============================================================================
-- B. 呼び出し元の拒否
-- =============================================================================
select public.qa_login_null_uid();
select throws_ok(
  $$ select * from public.get_team_member_focus_points('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f4') $$,
  'P0001', 'authentication required',
  'B-1: 未ログイン (auth.uid() が NULL) は拒否');

select public.qa_login_anon();
select throws_ok(
  $$ select * from public.get_team_member_focus_points('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f4') $$,
  '42501', null,
  'B-2: anon には実行権限が無い');

select public.qa_login_as('f0c05100-0000-4000-a000-0000000000f7');
select throws_ok(
  $$ select * from public.get_team_member_focus_points('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f4') $$,
  'P0001', 'not an approved active admin of the team',
  'B-3: 一般メンバーは他のメンバーのフォーカスポイントを読めない');

select public.qa_login_as('f0c05100-0000-4000-a000-0000000000f2');
select throws_ok(
  $$ select * from public.get_team_member_focus_points('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f4') $$,
  'P0001', 'not an approved active admin of the team',
  'B-4: 承認待ちの管理者は拒否');

select public.qa_login_as('f0c05100-0000-4000-a000-0000000000f3');
select throws_ok(
  $$ select * from public.get_team_member_focus_points('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f4') $$,
  'P0001', 'not an approved active admin of the team',
  'B-5: 非アクティブな管理者は拒否');

select public.qa_login_as('f0c05100-0000-4000-a000-0000000000f8');
select throws_ok(
  $$ select * from public.get_team_member_focus_points('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f4') $$,
  'P0001', 'not an approved active admin of the team',
  'B-6: 別チームの管理者は拒否');

-- =============================================================================
-- C. 対象の拒否
-- =============================================================================
select public.qa_login_as('f0c05100-0000-4000-a000-0000000000f1');
select throws_ok(
  $$ select * from public.get_team_member_focus_points('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f5') $$,
  'P0001', 'target is not an approved active member of the team',
  'C-1: 承認待ちのメンバーは対象にできない');

select throws_ok(
  $$ select * from public.get_team_member_focus_points('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f6') $$,
  'P0001', 'target is not an approved active member of the team',
  'C-2: 非アクティブなメンバーは対象にできない');

select throws_ok(
  $$ select * from public.get_team_member_focus_points('f0c05200-0000-4000-a000-000000000001', 'f0c05100-0000-4000-a000-0000000000f9') $$,
  'P0001', 'target is not an approved active member of the team',
  'C-3: チーム外の人は対象にできない');

select public.qa_logout();

select is(
  (select count(*)::integer from public.focus_points where user_id = 'f0c05100-0000-4000-a000-0000000000f4'),
  4,
  'C-4: 読み取りだけで、対象のフォーカスポイントは変わっていない');

select * from finish();
rollback;
