-- =============================================================================
-- pgTAP: 過去日大会の entry_status 自動クローズの実DB検証
--
-- 対象 migration:
--   - 20260820000000_auto_close_past_competition_entry_status.sql
--
-- 方針: この migration は (08 の attendance_status 版と異なり) 関数化されて
-- おらず、バックフィル UPDATE と pg_cron ジョブ登録が生の SQL として
-- migration ファイルに直接書かれている。境界式をテスト側に再実装して
-- 突き合わせると「同じ式を2回書いて一致を確認する」トートロジーになるため、
-- 実物の migration ファイルを `\ir` (呼び出し元スクリプトのディレクトリ基準の
-- 相対パス解決) でそのまま再ソースし、実際に発行される UPDATE 文をフィクスチャに
-- 対して実行させ、その前後差分のみを観測する。境界式そのものの再実装はしない。
--
-- 日付はハードコードせず、全て「UTC-12 (Anywhere on Earth) の今日」を基準にした
-- 相対値で作る。この基準日を作るためだけのヘルパー関数
-- qa_entstat_aoe_today() は migration と同じ式を使うが、これは「フィクスチャの
-- 相対日付を作る」ためだけに使い、期待値の判定 (アサーション) には一切使わない
-- (期待値は 'closed'/'open' 等のリテラルで直接書き下す)。
--
-- 実行: ローカル Supabase 起動済み (supabase start + migration 適用済み) の状態で
--       `supabase test db` を実行する。全フィクスチャは rollback で消える。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

-- -----------------------------------------------------------------------------
-- フィクスチャ
--   team1 に admin_u が所属。team 大会と個人大会 (team_id IS NULL) を
--   境界前後・複数日開催・既 closed で並べる。
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-4000-a000-000000000002', 'qa-entstat-admin@example.test');

insert into public.users (id, name)
select id, email from auth.users
where id = 'a0000000-0000-4000-a000-000000000002'
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('a0000000-0000-4000-a000-000000000001', 'QA EntStat Team1', 'QA-ENTSTAT-C1',
   'a0000000-0000-4000-a000-000000000002');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at) values
  ('a0000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000002',
   'admin', 'approved', true, '2026-01-01');

create function public.qa_entstat_aoe_today() returns date language sql stable as $$
  select (now() at time zone 'UTC' - interval '12 hours')::date
$$;

insert into public.competitions (id, user_id, team_id, title, date, end_date, entry_status) values
  -- c1: 過去日 (チーム大会, open) → closed になるはず
  ('b0000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000002',
   'a0000000-0000-4000-a000-000000000001', 'QA過去チーム大会', public.qa_entstat_aoe_today() - 1, null, 'open'),
  -- c2: だいぶ過去 (個人大会=team_id NULL, before) → closed になるはず (before も対象)
  ('b0000000-0000-4000-a000-000000000002', 'a0000000-0000-4000-a000-000000000002',
   null, 'QA過去個人大会before', public.qa_entstat_aoe_today() - 30, null, 'before'),
  -- c3: 過去日 (個人大会=team_id NULL, open) → closed になるはず (team_id IS NULL 対象確認)
  ('b0000000-0000-4000-a000-000000000003', 'a0000000-0000-4000-a000-000000000002',
   null, 'QA過去個人大会open', public.qa_entstat_aoe_today() - 2, null, 'open'),
  -- c4: 過去日だが既に closed (チーム大会) → 対象外・updated_at 不変のはず
  ('b0000000-0000-4000-a000-000000000004', 'a0000000-0000-4000-a000-000000000002',
   'a0000000-0000-4000-a000-000000000001', 'QA既closedチーム大会', public.qa_entstat_aoe_today() - 7, null, 'closed'),
  -- c5: UTC-12 基準で「今日」(チーム大会, open) → SC2-12: closed にならないはず
  ('b0000000-0000-4000-a000-000000000005', 'a0000000-0000-4000-a000-000000000002',
   'a0000000-0000-4000-a000-000000000001', 'QA当日チーム大会', public.qa_entstat_aoe_today(), null, 'open'),
  -- c6: UTC-12 基準で「今日」(個人大会=team_id NULL, before) → SC2-12: closed にならないはず
  ('b0000000-0000-4000-a000-000000000006', 'a0000000-0000-4000-a000-000000000002',
   null, 'QA当日個人大会before', public.qa_entstat_aoe_today(), null, 'before'),
  -- c7: 未来日 (チーム大会, open) → closed にならないはず
  ('b0000000-0000-4000-a000-000000000007', 'a0000000-0000-4000-a000-000000000002',
   'a0000000-0000-4000-a000-000000000001', 'QA未来チーム大会', public.qa_entstat_aoe_today() + 7, null, 'open'),
  -- c8: 開始日は過去・終了日は未来の複数日開催 (チーム大会, open) → closed になるはず (D2-1: 境界は date 側)
  ('b0000000-0000-4000-a000-000000000008', 'a0000000-0000-4000-a000-000000000002',
   'a0000000-0000-4000-a000-000000000001', 'QA開催中チーム大会', public.qa_entstat_aoe_today() - 3,
   public.qa_entstat_aoe_today() + 5, 'open');

-- 実行前の全カラムを退避 (entry_status/updated_at 以外が書き換わっていないことの
-- 判定は、境界式を再計算するのではなく必ずこの退避値との比較で行う)
create temporary table qa_before_run as
select id, updated_at, entry_status, title, date, end_date, team_id, attendance_status
from public.competitions
where id::text like 'b0000000-0000-4000-a000-%';

-- -----------------------------------------------------------------------------
-- 実行1回目: 実物の migration ファイルをそのまま再ソースする
-- (\ir は「呼び出し元スクリプト=本ファイルのディレクトリ」基準で相対パスを解決するため
--  supabase/tests/ から見て supabase/migrations/ 配下のファイルを CWD 非依存で指せる)
-- -----------------------------------------------------------------------------
\ir ../migrations/20260820000000_auto_close_past_competition_entry_status.sql

create temporary table qa_after_run1 as
select id, updated_at, entry_status, title, date, end_date, team_id, attendance_status
from public.competitions
where id::text like 'b0000000-0000-4000-a000-%';

-- -----------------------------------------------------------------------------
-- A. 過去日は closed になる (SC2-1 / SC2-13)
-- -----------------------------------------------------------------------------
select is(
  (select entry_status::text from qa_after_run1 where id = 'b0000000-0000-4000-a000-000000000001'),
  'closed',
  'A-1: 過去日のチーム大会 (open) は closed になる');

select is(
  (select entry_status::text from qa_after_run1 where id = 'b0000000-0000-4000-a000-000000000002'),
  'closed',
  'A-2: だいぶ過去の個人大会 (before) も closed になる (before も対象)');

select is(
  (select entry_status::text from qa_after_run1 where id = 'b0000000-0000-4000-a000-000000000003'),
  'closed',
  'A-3: 過去日の個人大会 (team_id IS NULL, open) も closed になる');

-- -----------------------------------------------------------------------------
-- B. 既に closed の行は対象外・updated_at 不変 (SC2-6)
-- -----------------------------------------------------------------------------
select is(
  (select entry_status::text from qa_after_run1 where id = 'b0000000-0000-4000-a000-000000000004'),
  'closed',
  'B-1: 既に closed の過去チーム大会は closed のまま');

select is(
  (select r1.updated_at from qa_after_run1 r1
   join qa_before_run b on b.id = r1.id
   where r1.id = 'b0000000-0000-4000-a000-000000000004'),
  (select updated_at from qa_before_run where id = 'b0000000-0000-4000-a000-000000000004'),
  'B-2: 既に closed の過去行は updated_at が変化しない (無駄な UPDATE 対象外)');

-- -----------------------------------------------------------------------------
-- C. SC2-12 (最重要): UTC-12 でまだ当日の大会は closed にならない
-- -----------------------------------------------------------------------------
select is(
  (select entry_status::text from qa_after_run1 where id = 'b0000000-0000-4000-a000-000000000005'),
  'open',
  'C-1 (SC2-12): UTC-12 でまだ当日のチーム大会 (open) は closed にならない');

select is(
  (select entry_status::text from qa_after_run1 where id = 'b0000000-0000-4000-a000-000000000006'),
  'before',
  'C-2 (SC2-12): UTC-12 でまだ当日の個人大会 (before) も closed にならない');

select is(
  (select r1.updated_at from qa_after_run1 r1
   join qa_before_run b on b.id = r1.id
   where r1.id = 'b0000000-0000-4000-a000-000000000005'),
  (select updated_at from qa_before_run where id = 'b0000000-0000-4000-a000-000000000005'),
  'C-3 (SC2-12): 当日の大会は updated_at も一切触られない');

-- -----------------------------------------------------------------------------
-- D. 未来日は不変 (SC2-3)
-- -----------------------------------------------------------------------------
select is(
  (select entry_status::text from qa_after_run1 where id = 'b0000000-0000-4000-a000-000000000007'),
  'open',
  'D-1: 未来日のチーム大会 (open) は open のまま');

select is(
  (select r1.updated_at from qa_after_run1 r1
   join qa_before_run b on b.id = r1.id
   where r1.id = 'b0000000-0000-4000-a000-000000000007'),
  (select updated_at from qa_before_run where id = 'b0000000-0000-4000-a000-000000000007'),
  'D-2: 未来日の大会は updated_at も変化しない');

-- -----------------------------------------------------------------------------
-- E. 複数日開催: 開始日が過去なら終了日が未来でも closed (D2-1)
-- -----------------------------------------------------------------------------
select is(
  (select entry_status::text from qa_after_run1 where id = 'b0000000-0000-4000-a000-000000000008'),
  'closed',
  'E-1 (D2-1): 開始日が過去・終了日が未来の複数日開催も closed になる (境界は date 側)');

select is(
  (select end_date from qa_after_run1 where id = 'b0000000-0000-4000-a000-000000000008'),
  (select end_date from qa_before_run where id = 'b0000000-0000-4000-a000-000000000008'),
  'E-2: end_date 自体は書き換えられない (実行前スナップショットと一致)');

-- -----------------------------------------------------------------------------
-- F. entry_status 以外のカラムは不変 (SC2-6)
-- -----------------------------------------------------------------------------
select is(
  (select title from qa_after_run1 where id = 'b0000000-0000-4000-a000-000000000001'),
  (select title from qa_before_run where id = 'b0000000-0000-4000-a000-000000000001'),
  'F-1: title は書き換えられない (実行前スナップショットと一致)');

select is(
  (select date from qa_after_run1 where id = 'b0000000-0000-4000-a000-000000000001'),
  (select date from qa_before_run where id = 'b0000000-0000-4000-a000-000000000001'),
  'F-2: date は書き換えられない (実行前スナップショットと一致)');

select is(
  (select team_id from qa_after_run1 where id = 'b0000000-0000-4000-a000-000000000001'),
  (select team_id from qa_before_run where id = 'b0000000-0000-4000-a000-000000000001'),
  'F-3: team_id は書き換えられない (実行前スナップショットと一致)');

select is(
  (select attendance_status::text from qa_after_run1 where id = 'b0000000-0000-4000-a000-000000000001'),
  (select attendance_status::text from qa_before_run where id = 'b0000000-0000-4000-a000-000000000001'),
  'F-4: attendance_status は今回の対象外で書き換えられない (実行前スナップショットと一致)');

select is(
  (select team_id from qa_after_run1 where id = 'b0000000-0000-4000-a000-000000000003'),
  (select team_id from qa_before_run where id = 'b0000000-0000-4000-a000-000000000003'),
  'F-5: 個人大会 (c3) の team_id は NULL のまま (団体大会に変換されない)');

-- -----------------------------------------------------------------------------
-- G. 冪等性 (SC2-7): 同じ migration をもう一度そのまま再ソースしても
--    フィクスチャの entry_status / updated_at は一切変化しない
-- -----------------------------------------------------------------------------
\ir ../migrations/20260820000000_auto_close_past_competition_entry_status.sql

create temporary table qa_after_run2 as
select id, updated_at, entry_status from public.competitions
where id::text like 'b0000000-0000-4000-a000-%';

select is(
  (select count(*)::int from qa_after_run1 r1
   join qa_after_run2 r2 on r2.id = r1.id
   where r2.entry_status is distinct from r1.entry_status
      or r2.updated_at is distinct from r1.updated_at),
  0,
  'G-1 (SC2-7): 2回目の再ソースでは entry_status / updated_at とも一切変化しない (冪等)');

select * from finish();
rollback;
