-- =============================================================================
-- pgTAP: delete_competition_with_records RPC の実DB検証 (QA Sprint Contract)
--
-- 対象 migration: 20260826000000_delete_competition_with_records_rpc.sql
--
-- 確定仕様 (ユーザー明示決定、覆さない):
--   1. records を削除するのは個人大会 (team_id IS NULL) のみ。
--      チーム大会 (team_id IS NOT NULL) の削除では records を削除しない。
--   2. チーム大会は「拒否」ではなく「大会だけ削除」が正しい
--      (拒否すると自分が作成したチーム大会を削除できなくなる退行)。
--
-- 観点:
--   V-DB-01: 未認証 (anon ロール) は GRANT 層で EXECUTE 自体を拒否される。
--   V-DB-02: authenticated だが JWT 無し (auth.uid() IS NULL) は関数内ガードで
--            {success:false} を返し、何も変更しない。
--   V-DB-03: 存在しない competition_id は {success:false}、無変更。
--   V-DB-04: 他人 (作成者でない) の大会に対する直接呼び出しは {success:false}、
--            大会・records とも無変更。
--   V-DB-05 (中核・回帰防止): 個人大会の削除は records と split_times を全削除し、
--            deleted_record_count に実件数を返す。
--   V-DB-06 (中核・確定仕様): チーム大会の削除は "拒否されず成功" し、大会は
--            削除されるが records (他メンバーのものを含む) は1件も削除されない。
--            deleted_record_count は 0。
--   V-DB-07 (ロールバック/原子性): 関数内で例外が起きた場合、records/competitions
--            とも変更前の状態に戻る (中間状態が残らない)。
--   V-DB-08: anon への GRANT が REVOKE 済みで authenticated のみ EXECUTE 可能。
--   V-DB-09/10 (PM追加指摘・Critical再発防止): competitions.user_id は NULLABLE。
--            認可ガードが `v_competition_owner <> v_caller` のような素朴な比較だと、
--            user_id IS NULL の大会に対して NULL <> uuid が NULL になり plpgsql の
--            IF が発火せず fail open する (無関係な第三者が削除できてしまう)。
--            IS DISTINCT FROM を使った修正後は、user_id IS NULL の大会
--            (個人大会相当・チーム大会相当の両方) に対する無関係な第三者からの
--            削除が success:false になり、competitions/records とも無変更のままで
--            あることを検証する。
--
-- 方針: モックせず実際の Postgres 上で RLS・GRANT・RPC 分岐・ロールバックを検証する。
--       01_team_memberships_rls.test.sql / 04_usage_rpc_and_team_content_rls.test.sql
--       と同型の qa_login_as/qa_login_anon/qa_logout ヘルパーを使う。
--
-- 実行: ローカル Supabase 起動済み (supabase start + migration 適用済み) の状態で
--       `supabase test db` を実行する。全フィクスチャは rollback で消える。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

-- -----------------------------------------------------------------------------
-- ヘルパー: JWT クレーム + ロール切替
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
-- フィクスチャ
--   owner_u  : 個人大会 + チーム大会(team1) の作成者。両方の削除を実行する主体。
--   member_u : team1 の一般メンバー。チーム大会に自分の records を持つ
--              (「他メンバーの記録が消えないこと」を検証する対象)。
--   other_u  : owner_u とは無関係。owner_u の大会を削除しようとする攻撃者役。
--
--   personal_comp: team_id IS NULL, owner_u 作成。records 7件 + 一部に split_times。
--                  (7 は "1" のような部分文字列マッチしうる値を避けるため)
--   team_comp    : team_id = team1, owner_u 作成。records 5件
--                  (owner_u 分 2件 + member_u 分 3件)。7と異なる値にして
--                  「どちらの分岐が実行されたか」を件数で判別可能にする。
--   other_comp   : team_id IS NULL, other_u 作成。records 2件。
--                  owner_u による不正アクセス対象。
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('c0000000-0000-4000-a000-000000000001', 'qa-delcomp-owner@example.test'),
  ('c0000000-0000-4000-a000-000000000002', 'qa-delcomp-member@example.test'),
  ('c0000000-0000-4000-a000-000000000003', 'qa-delcomp-other@example.test'),
  ('c0000000-0000-4000-a000-000000000004', 'qa-delcomp-attacker@example.test');

insert into public.users (id, name)
select id, email from auth.users
where email like 'qa-delcomp-%@example.test'
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('d0000000-0000-4000-a000-000000000001', 'QA DelComp Team1', 'QA-DELCOMP-T1',
   'c0000000-0000-4000-a000-000000000001');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at) values
  ('d0000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000001', 'admin', 'approved', true, '2026-01-01'),
  ('d0000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000002', 'user',  'approved', true, '2026-01-01');

-- 個人大会 (owner_u, team_id NULL)
insert into public.competitions (id, user_id, team_id, title, date) values
  ('e0000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000001', null,
   'QA個人大会(削除対象)', '2026-07-01');

-- チーム大会 (owner_u 作成, team1)
insert into public.competitions (id, user_id, team_id, title, date) values
  ('e0000000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000001',
   'd0000000-0000-4000-a000-000000000001', 'QAチーム大会(削除対象)', '2026-07-02');

-- other_u の個人大会 (owner_u が不正に削除しようとする対象)
insert into public.competitions (id, user_id, team_id, title, date) values
  ('e0000000-0000-4000-a000-000000000003', 'c0000000-0000-4000-a000-000000000003', null,
   'QA他人大会', '2026-07-03');

-- 存在しない competition_id (V-DB-03 用)
-- (INSERT しない。ランダムな UUID をそのまま使う)

-- 個人大会の records 7件 (style_id=1 は seed 済み)
insert into public.records (id, user_id, competition_id, style_id, time, pool_type) values
  ('f0000000-0000-4000-a000-000000000001', 'c0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000001', 1, 30.01, 0),
  ('f0000000-0000-4000-a000-000000000002', 'c0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000001', 1, 30.02, 0),
  ('f0000000-0000-4000-a000-000000000003', 'c0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000001', 1, 30.03, 0),
  ('f0000000-0000-4000-a000-000000000004', 'c0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000001', 1, 30.04, 0),
  ('f0000000-0000-4000-a000-000000000005', 'c0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000001', 1, 30.05, 0),
  ('f0000000-0000-4000-a000-000000000006', 'c0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000001', 1, 30.06, 0),
  ('f0000000-0000-4000-a000-000000000007', 'c0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000001', 1, 30.07, 0);

-- 個人大会の records のうち3件に split_times を付与 (CASCADE 確認用)
insert into public.split_times (id, record_id, distance, split_time) values
  ('a1000000-0000-4000-a000-000000000001', 'f0000000-0000-4000-a000-000000000001', 25, 15.00),
  ('a1000000-0000-4000-a000-000000000002', 'f0000000-0000-4000-a000-000000000002', 25, 15.00),
  ('a1000000-0000-4000-a000-000000000003', 'f0000000-0000-4000-a000-000000000003', 25, 15.00);

-- チーム大会の records 5件 (owner_u 2件 + member_u 3件、team_id 付き)
insert into public.records (id, user_id, competition_id, team_id, style_id, time, pool_type) values
  ('f0000000-0000-4000-a000-000000000011', 'c0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000002', 'd0000000-0000-4000-a000-000000000001', 1, 31.01, 0),
  ('f0000000-0000-4000-a000-000000000012', 'c0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000002', 'd0000000-0000-4000-a000-000000000001', 1, 31.02, 0),
  ('f0000000-0000-4000-a000-000000000013', 'c0000000-0000-4000-a000-000000000002', 'e0000000-0000-4000-a000-000000000002', 'd0000000-0000-4000-a000-000000000001', 1, 31.03, 0),
  ('f0000000-0000-4000-a000-000000000014', 'c0000000-0000-4000-a000-000000000002', 'e0000000-0000-4000-a000-000000000002', 'd0000000-0000-4000-a000-000000000001', 1, 31.04, 0),
  ('f0000000-0000-4000-a000-000000000015', 'c0000000-0000-4000-a000-000000000002', 'e0000000-0000-4000-a000-000000000002', 'd0000000-0000-4000-a000-000000000001', 1, 31.05, 0);

-- チーム大会の records のうち2件に split_times を付与
-- (V-DB-06 で「records が消えない」ことの一部として split_times も消えないことを確認)
insert into public.split_times (id, record_id, distance, split_time) values
  ('a1000000-0000-4000-a000-000000000011', 'f0000000-0000-4000-a000-000000000011', 25, 15.50),
  ('a1000000-0000-4000-a000-000000000013', 'f0000000-0000-4000-a000-000000000013', 25, 15.50);

-- other_u の個人大会 records 2件
insert into public.records (id, user_id, competition_id, style_id, time, pool_type) values
  ('f0000000-0000-4000-a000-000000000021', 'c0000000-0000-4000-a000-000000000003', 'e0000000-0000-4000-a000-000000000003', 1, 32.01, 0),
  ('f0000000-0000-4000-a000-000000000022', 'c0000000-0000-4000-a000-000000000003', 'e0000000-0000-4000-a000-000000000003', 1, 32.02, 0);

-- =============================================================================
-- V-DB-09/10 用フィクスチャ: user_id IS NULL の大会 (fail open 再発防止)
--   competitions.user_id は NOT NULL 制約が無いため実在しうる状態。
--   orphan_personal_comp: user_id NULL, team_id NULL (個人大会相当)。records 3件。
--   orphan_team_comp    : user_id NULL, team_id = team1 (チーム大会相当)。
--                         records 4件 (member_u 所有、3/5/7と異なる判別可能な値)。
--   attacker_u          : owner_u/member_u/other_u のいずれでもない無関係な第三者。
-- =============================================================================
insert into public.competitions (id, user_id, team_id, title, date) values
  ('e0000000-0000-4000-a000-000000000004', null, null, 'QA user_id NULL個人大会相当', '2026-07-04'),
  ('e0000000-0000-4000-a000-000000000005', null, 'd0000000-0000-4000-a000-000000000001',
   'QA user_id NULLチーム大会相当', '2026-07-05');

insert into public.records (id, user_id, competition_id, style_id, time, pool_type) values
  ('f0000000-0000-4000-a000-000000000031', 'c0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000004', 1, 33.01, 0),
  ('f0000000-0000-4000-a000-000000000032', 'c0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000004', 1, 33.02, 0),
  ('f0000000-0000-4000-a000-000000000033', 'c0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000004', 1, 33.03, 0);

insert into public.records (id, user_id, competition_id, team_id, style_id, time, pool_type) values
  ('f0000000-0000-4000-a000-000000000041', 'c0000000-0000-4000-a000-000000000002', 'e0000000-0000-4000-a000-000000000005', 'd0000000-0000-4000-a000-000000000001', 1, 34.01, 0),
  ('f0000000-0000-4000-a000-000000000042', 'c0000000-0000-4000-a000-000000000002', 'e0000000-0000-4000-a000-000000000005', 'd0000000-0000-4000-a000-000000000001', 1, 34.02, 0),
  ('f0000000-0000-4000-a000-000000000043', 'c0000000-0000-4000-a000-000000000002', 'e0000000-0000-4000-a000-000000000005', 'd0000000-0000-4000-a000-000000000001', 1, 34.03, 0),
  ('f0000000-0000-4000-a000-000000000044', 'c0000000-0000-4000-a000-000000000002', 'e0000000-0000-4000-a000-000000000005', 'd0000000-0000-4000-a000-000000000001', 1, 34.04, 0);

-- =============================================================================
-- V-DB-01: anon は GRANT 層で EXECUTE 自体を拒否される
-- =============================================================================
select ok(
  not has_function_privilege(
    'anon',
    'public.delete_competition_with_records(uuid)',
    'EXECUTE'),
  'V-DB-01a: anon ロールは delete_competition_with_records を EXECUTE できない (REVOKE 済み)');

select public.qa_login_anon();

select throws_ok(
  $$ select public.delete_competition_with_records('e0000000-0000-4000-a000-000000000001'::uuid) $$,
  '42501', null,
  'V-DB-01b: anon ロールが RPC を直接呼んでも GRANT 層で拒否される (例外そのもの)');

select public.qa_logout();

select is(
  (select count(*)::int from public.competitions where id = 'e0000000-0000-4000-a000-000000000001'),
  1,
  'V-DB-01c: anon による攻撃後も個人大会は削除されていない');

-- =============================================================================
-- V-DB-02: authenticated ロールだが JWT 無し (auth.uid() IS NULL) → 関数内ガード
-- =============================================================================
select set_config('request.jwt.claims', '', true);
select set_config('role', 'authenticated', true);

select results_eq(
  $$ select (public.delete_competition_with_records('e0000000-0000-4000-a000-000000000001'::uuid)->>'success')::boolean $$,
  $$ values (false) $$,
  'V-DB-02a: auth.uid() が NULL のとき success:false を返す');

select public.qa_logout();

select is(
  (select count(*)::int from public.competitions where id = 'e0000000-0000-4000-a000-000000000001'),
  1,
  'V-DB-02b: auth.uid() NULL での呼び出し後も個人大会は削除されていない');

-- =============================================================================
-- V-DB-03: 存在しない competition_id
-- =============================================================================
select public.qa_login_as('c0000000-0000-4000-a000-000000000001'); -- owner_u

select results_eq(
  $$ select (public.delete_competition_with_records('99999999-9999-4999-a999-999999999999'::uuid)->>'success')::boolean $$,
  $$ values (false) $$,
  'V-DB-03: 存在しない competition_id は success:false を返す');

select public.qa_logout();

-- =============================================================================
-- V-DB-04: 他人 (作成者でない) の大会に対する直接呼び出し
-- =============================================================================
select public.qa_login_as('c0000000-0000-4000-a000-000000000001'); -- owner_u (other_comp の作成者ではない)

select results_eq(
  $$ select (public.delete_competition_with_records('e0000000-0000-4000-a000-000000000003'::uuid)->>'success')::boolean $$,
  $$ values (false) $$,
  'V-DB-04a: 他人の大会に対する削除は success:false を返す');

select public.qa_logout();

select is(
  (select count(*)::int from public.competitions where id = 'e0000000-0000-4000-a000-000000000003'),
  1,
  'V-DB-04b: 他人の大会は削除されていない (無変更)');

select is(
  (select count(*)::int from public.records where competition_id = 'e0000000-0000-4000-a000-000000000003'),
  2,
  'V-DB-04c: 他人の大会に紐づく records も無変更 (2件のまま)');

-- =============================================================================
-- V-DB-05 (中核・回帰防止): 個人大会の削除で records + split_times が全削除される
-- =============================================================================
select is(
  (select count(*)::int from public.records where competition_id = 'e0000000-0000-4000-a000-000000000001'),
  7,
  'V-DB-05 前提: 個人大会の records は7件存在する');

select public.qa_login_as('c0000000-0000-4000-a000-000000000001'); -- owner_u

select results_eq(
  $$ select (public.delete_competition_with_records('e0000000-0000-4000-a000-000000000001'::uuid)->>'success')::boolean $$,
  $$ values (true) $$,
  'V-DB-05a: 個人大会削除は success:true を返す');

select is(
  (select count(*)::int from public.competitions where id = 'e0000000-0000-4000-a000-000000000001'),
  0,
  'V-DB-05c: 個人大会 (competitions行) は削除されている');

select is(
  (select count(*)::int from public.records where competition_id = 'e0000000-0000-4000-a000-000000000001'),
  0,
  'V-DB-05d: 個人大会に紐づく records は全件 (7件) 削除されている');

select is(
  (select count(*)::int from public.split_times
   where record_id in (
     'f0000000-0000-4000-a000-000000000001',
     'f0000000-0000-4000-a000-000000000002',
     'f0000000-0000-4000-a000-000000000003'
   )),
  0,
  'V-DB-05e: 個人大会の records に紐づいていた split_times も CASCADE で削除されている');

select public.qa_logout();

-- =============================================================================
-- V-DB-06 (中核・確定仕様): チーム大会の削除は "成功" し、大会のみ消え records は残る
-- =============================================================================
select is(
  (select count(*)::int from public.records where competition_id = 'e0000000-0000-4000-a000-000000000002'),
  5,
  'V-DB-06 前提: チーム大会の records は5件存在する');

select public.qa_login_as('c0000000-0000-4000-a000-000000000001'); -- owner_u (team_comp の作成者)

select results_eq(
  $$ select (public.delete_competition_with_records('e0000000-0000-4000-a000-000000000002'::uuid)->>'success')::boolean $$,
  $$ values (true) $$,
  'V-DB-06a (退行検出): チーム大会の削除は "拒否されず" success:true を返す');

select is(
  (select count(*)::int from public.competitions where id = 'e0000000-0000-4000-a000-000000000002'),
  0,
  'V-DB-06b: チーム大会 (competitions行) 自体は削除されている');

select is(
  (select count(*)::int from public.records
   where id in (
     'f0000000-0000-4000-a000-000000000011',
     'f0000000-0000-4000-a000-000000000012',
     'f0000000-0000-4000-a000-000000000013',
     'f0000000-0000-4000-a000-000000000014',
     'f0000000-0000-4000-a000-000000000015'
   )),
  5,
  'V-DB-06c (確定仕様の中核): チーム大会削除後も records は1件も削除されず5件のまま残っている');

select is(
  (select count(*)::int from public.records
   where id in (
     'f0000000-0000-4000-a000-000000000013',
     'f0000000-0000-4000-a000-000000000014',
     'f0000000-0000-4000-a000-000000000015'
   ) and user_id = 'c0000000-0000-4000-a000-000000000002'),
  3,
  'V-DB-06d: member_u (他メンバー) の3件の records も削除されず残っている');

select is(
  (select count(*)::int from public.split_times
   where record_id in (
     'f0000000-0000-4000-a000-000000000011',
     'f0000000-0000-4000-a000-000000000013'
   )),
  2,
  'V-DB-06e: チーム大会 records に紐づく split_times も削除されず残っている');

select public.qa_logout();

-- =============================================================================
-- V-DB-07 (ロールバック/原子性): 関数内で例外が起きたら records/competitions とも
-- 変更前に戻る (中間状態が残らない)。
--
-- 手法: other_comp (個人大会, team_id NULL) の competitions 側に BEFORE DELETE
-- トリガーを仕込み、必ず例外を発生させる。これにより
--   1. DELETE FROM records (先行) は成功する
--   2. DELETE FROM competitions (後続) で例外発生
-- という「関数の途中で失敗」を再現する。DO ブロックの EXCEPTION ハンドラは
-- 暗黙のサブトランザクションとして機能するため、ここで例外を捕捉すれば
-- 1.の records DELETE も含めて丸ごとロールバックされる (Postgres の仕様)。
-- =============================================================================
create function public.qa_delcomp_fail_trigger() returns trigger language plpgsql as $$
begin
  raise exception 'qa_injected_failure_for_rollback_test';
end $$;

create trigger qa_delcomp_fail_before_delete
  before delete on public.competitions
  for each row
  when (old.id = 'e0000000-0000-4000-a000-000000000003')
  execute function public.qa_delcomp_fail_trigger();

select public.qa_login_as('c0000000-0000-4000-a000-000000000003'); -- other_u (other_comp の作成者本人)

do $$
begin
  perform public.delete_competition_with_records('e0000000-0000-4000-a000-000000000003'::uuid);
  raise exception 'qa_expected_failure_did_not_occur';
exception
  when others then
    if SQLERRM = 'qa_expected_failure_did_not_occur' then
      raise;
    end if;
    -- 期待された注入エラー: このハンドラに到達した時点で暗黙のサブトランザクションが
    -- ロールバックされ、DELETE FROM records の分も含めて元に戻っている。
end $$;

select public.qa_logout();

drop trigger qa_delcomp_fail_before_delete on public.competitions;
drop function public.qa_delcomp_fail_trigger();

select is(
  (select count(*)::int from public.competitions where id = 'e0000000-0000-4000-a000-000000000003'),
  1,
  'V-DB-07a: 例外発生後も other_comp (competitions行) は削除されず残っている (ロールバック)');

select is(
  (select count(*)::int from public.records where competition_id = 'e0000000-0000-4000-a000-000000000003'),
  2,
  'V-DB-07b: 例外発生後も records は先行 DELETE 分を含めて2件とも復元されている (中間状態が残らない)');

-- =============================================================================
-- V-DB-08: GRANT 権限の最終確認 (authenticated のみ EXECUTE 可能)
-- =============================================================================
select ok(
  has_function_privilege(
    'authenticated',
    'public.delete_competition_with_records(uuid)',
    'EXECUTE'),
  'V-DB-08a: authenticated ロールは delete_competition_with_records を EXECUTE できる');

select ok(
  has_function_privilege(
    'service_role',
    'public.delete_competition_with_records(uuid)',
    'EXECUTE'),
  'V-DB-08b: service_role は delete_competition_with_records を EXECUTE できる');

-- =============================================================================
-- V-DB-09 (Critical再発防止・PM追加指摘): user_id IS NULL の「個人大会相当」に対する
-- 無関係な第三者 (attacker_u) からの削除は success:false になり、無変更のままである。
--
-- `v_competition_owner <> v_caller` のような素朴な比較だと、v_competition_owner が
-- NULL のとき NULL <> uuid は NULL (plpgsqlのIFでは偽扱い) になり、認可ガードが
-- 素通りして fail open する。IS DISTINCT FROM 修正後はここが success:false になる。
-- =============================================================================
select is(
  (select count(*)::int from public.records where competition_id = 'e0000000-0000-4000-a000-000000000004'),
  3,
  'V-DB-09 前提: user_id IS NULL の個人大会相当の records は3件存在する');

select public.qa_login_as('c0000000-0000-4000-a000-000000000004'); -- attacker_u (無関係な第三者)

select results_eq(
  $$ select (public.delete_competition_with_records('e0000000-0000-4000-a000-000000000004'::uuid)->>'success')::boolean $$,
  $$ values (false) $$,
  'V-DB-09a (fail open 再発防止): user_id IS NULL の個人大会相当に対する無関係な第三者の削除は success:false');

select public.qa_logout();

select is(
  (select count(*)::int from public.competitions where id = 'e0000000-0000-4000-a000-000000000004'),
  1,
  'V-DB-09b: 攻撃後も user_id IS NULL の個人大会相当 (competitions行) は削除されていない');

select is(
  (select count(*)::int from public.records where competition_id = 'e0000000-0000-4000-a000-000000000004'),
  3,
  'V-DB-09c: 攻撃後も紐づく records は1件も削除されず3件のまま (fail open していれば0件になる)');

-- =============================================================================
-- V-DB-10 (Critical再発防止・PM追加指摘): user_id IS NULL の「チーム大会相当」に対する
-- 無関係な第三者 (attacker_u) からの削除も同様に success:false になり、無変更のまま。
-- =============================================================================
select is(
  (select count(*)::int from public.records where competition_id = 'e0000000-0000-4000-a000-000000000005'),
  4,
  'V-DB-10 前提: user_id IS NULL のチーム大会相当の records は4件存在する');

select public.qa_login_as('c0000000-0000-4000-a000-000000000004'); -- attacker_u (team1 にも非所属)

select results_eq(
  $$ select (public.delete_competition_with_records('e0000000-0000-4000-a000-000000000005'::uuid)->>'success')::boolean $$,
  $$ values (false) $$,
  'V-DB-10a (fail open 再発防止): user_id IS NULL のチーム大会相当に対する無関係な第三者の削除は success:false');

select public.qa_logout();

select is(
  (select count(*)::int from public.competitions where id = 'e0000000-0000-4000-a000-000000000005'),
  1,
  'V-DB-10b: 攻撃後も user_id IS NULL のチーム大会相当 (competitions行) は削除されていない');

select is(
  (select count(*)::int from public.records where competition_id = 'e0000000-0000-4000-a000-000000000005'),
  4,
  'V-DB-10c: 攻撃後も紐づく records は1件も削除されず4件のまま (fail open していれば0件になる)');

select * from finish();
rollback;
