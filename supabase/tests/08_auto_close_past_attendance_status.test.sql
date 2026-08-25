-- =============================================================================
-- pgTAP: 過去日イベントの attendance_status 自動クローズの実DB検証
--
-- 対象 migration:
--   - 20260820000001_auto_close_past_attendance_status.sql
--
-- 方針: migration が定義した実物の関数 public.close_past_attendance_status() を
-- そのまま呼び、フィクスチャの前後差分で挙動を確認する。UPDATE 文の述語を
-- テスト側にコピーして突き合わせると「同じ式を2回書いて一致を確認する」
-- トートロジーになるため行わない。
--
-- 実行: ローカル Supabase 起動済み (supabase start + migration 適用済み) の状態で
--       `supabase test db` を実行する。全フィクスチャは rollback で消える。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

-- -----------------------------------------------------------------------------
-- フィクスチャ
--   team1 に admin_a が所属。practices / competitions に境界前後の行を並べる。
--   日付は「UTC-12 (Anywhere on Earth) の今日」を基準にした相対値で作る。
--   関数の境界も UTC-12 であり、UTC 基準の current_date で作ると UTC と
--   UTC-12 が日を跨ぐ時間帯にフレークする。境界 TZ が UTC-12 であること自体は
--   最後の pg_get_functiondef 検査で固定する (挙動テストだけでは JST 実装との
--   差が 1 日 3 時間の窓でしか出ずフレークするため)。
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('99999999-9999-4999-a999-000000000001', 'qa-attclose-admin-a@example.test');

insert into public.users (id, name)
select id, email from auth.users
where id = '99999999-9999-4999-a999-000000000001'
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('aaaaaaaa-aaaa-4aaa-aaaa-000000000001', 'QA AttClose Team1', 'QA-ATTCLOSE-C1',
   '99999999-9999-4999-a999-000000000001');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at) values
  ('aaaaaaaa-aaaa-4aaa-aaaa-000000000001', '99999999-9999-4999-a999-000000000001',
   'admin', 'approved', true, '2026-01-01');

create function public.qa_aoe_today() returns date language sql stable as $$
  select (now() at time zone 'UTC' - interval '12 hours')::date
$$;

insert into public.practices (id, user_id, team_id, date, attendance_status) values
  -- 過去日
  ('bbbbbbbb-bbbb-4bbb-bbbb-000000000001', '99999999-9999-4999-a999-000000000001',
   'aaaaaaaa-aaaa-4aaa-aaaa-000000000001', public.qa_aoe_today() - 1, 'open'),
  ('bbbbbbbb-bbbb-4bbb-bbbb-000000000002', '99999999-9999-4999-a999-000000000001',
   'aaaaaaaa-aaaa-4aaa-aaaa-000000000001', public.qa_aoe_today() - 30, null),
  ('bbbbbbbb-bbbb-4bbb-bbbb-000000000003', '99999999-9999-4999-a999-000000000001',
   'aaaaaaaa-aaaa-4aaa-aaaa-000000000001', public.qa_aoe_today() - 7, 'closed'),
  -- 今日・未来
  ('bbbbbbbb-bbbb-4bbb-bbbb-000000000004', '99999999-9999-4999-a999-000000000001',
   'aaaaaaaa-aaaa-4aaa-aaaa-000000000001', public.qa_aoe_today(), 'open'),
  ('bbbbbbbb-bbbb-4bbb-bbbb-000000000005', '99999999-9999-4999-a999-000000000001',
   'aaaaaaaa-aaaa-4aaa-aaaa-000000000001', public.qa_aoe_today() + 7, 'open'),
  ('bbbbbbbb-bbbb-4bbb-bbbb-000000000006', '99999999-9999-4999-a999-000000000001',
   'aaaaaaaa-aaaa-4aaa-aaaa-000000000001', public.qa_aoe_today(), null);

insert into public.competitions (id, user_id, team_id, title, date, attendance_status) values
  ('cccccccc-cccc-4ccc-cccc-000000000001', '99999999-9999-4999-a999-000000000001',
   'aaaaaaaa-aaaa-4aaa-aaaa-000000000001', 'QA過去大会open', public.qa_aoe_today() - 1, 'open'),
  ('cccccccc-cccc-4ccc-cccc-000000000002', '99999999-9999-4999-a999-000000000001',
   'aaaaaaaa-aaaa-4aaa-aaaa-000000000001', 'QA過去大会unset', public.qa_aoe_today() - 30, null),
  ('cccccccc-cccc-4ccc-cccc-000000000003', '99999999-9999-4999-a999-000000000001',
   'aaaaaaaa-aaaa-4aaa-aaaa-000000000001', 'QA当日大会', public.qa_aoe_today(), 'open'),
  ('cccccccc-cccc-4ccc-cccc-000000000004', '99999999-9999-4999-a999-000000000001',
   'aaaaaaaa-aaaa-4aaa-aaaa-000000000001', 'QA未来大会', public.qa_aoe_today() + 7, 'open'),
  -- 複数日開催で開始日は過去・終了日は未来。境界は date 側であることを確認する。
  ('cccccccc-cccc-4ccc-cccc-000000000005', '99999999-9999-4999-a999-000000000001',
   'aaaaaaaa-aaaa-4aaa-aaaa-000000000001', 'QA開催中大会',
   public.qa_aoe_today() - 1, 'open');

update public.competitions set end_date = public.qa_aoe_today() + 1
where id = 'cccccccc-cccc-4ccc-cccc-000000000005';

-- 既に closed の過去行が無駄に更新されないことを確認するため updated_at を退避
create temporary table qa_before_updated_at as
select id, updated_at from public.practices
where id = 'bbbbbbbb-bbbb-4bbb-bbbb-000000000003';

-- -----------------------------------------------------------------------------
-- 実行: 実物の関数を1回呼ぶ
-- -----------------------------------------------------------------------------
create temporary table qa_first_run as
select public.close_past_attendance_status() as updated;

-- -----------------------------------------------------------------------------
-- A. practices の境界
-- -----------------------------------------------------------------------------
select is(
  (select attendance_status::text from public.practices
   where id = 'bbbbbbbb-bbbb-4bbb-bbbb-000000000001'),
  'closed',
  'A-1: 過去日の練習 (open) は closed になる');

select is(
  (select attendance_status::text from public.practices
   where id = 'bbbbbbbb-bbbb-4bbb-bbbb-000000000002'),
  'closed',
  'A-2: 過去日の練習 (未設定=NULL) も closed になる');

select is(
  (select attendance_status::text from public.practices
   where id = 'bbbbbbbb-bbbb-4bbb-bbbb-000000000004'),
  'open',
  'A-3: 当日の練習 (open) は open のまま (今日は過去扱いしない)');

select is(
  (select attendance_status::text from public.practices
   where id = 'bbbbbbbb-bbbb-4bbb-bbbb-000000000005'),
  'open',
  'A-4: 未来日の練習 (open) は open のまま');

select is(
  (select attendance_status from public.practices
   where id = 'bbbbbbbb-bbbb-4bbb-bbbb-000000000006'),
  null,
  'A-5: 当日の練習 (未設定=NULL) は NULL のまま (未設定の意味を壊さない)');

select is(
  (select b.updated_at from qa_before_updated_at b
   join public.practices p on p.id = b.id
   where p.updated_at = b.updated_at),
  (select updated_at from qa_before_updated_at),
  'A-6: 既に closed の過去行は更新されず updated_at が変化しない');

-- -----------------------------------------------------------------------------
-- B. competitions の境界
-- -----------------------------------------------------------------------------
select is(
  (select attendance_status::text from public.competitions
   where id = 'cccccccc-cccc-4ccc-cccc-000000000001'),
  'closed',
  'B-1: 過去日の大会 (open) は closed になる');

select is(
  (select attendance_status::text from public.competitions
   where id = 'cccccccc-cccc-4ccc-cccc-000000000002'),
  'closed',
  'B-2: 過去日の大会 (未設定=NULL) も closed になる');

select is(
  (select attendance_status::text from public.competitions
   where id = 'cccccccc-cccc-4ccc-cccc-000000000003'),
  'open',
  'B-3: 当日の大会 (open) は open のまま');

select is(
  (select attendance_status::text from public.competitions
   where id = 'cccccccc-cccc-4ccc-cccc-000000000004'),
  'open',
  'B-4: 未来日の大会 (open) は open のまま');

select is(
  (select attendance_status::text from public.competitions
   where id = 'cccccccc-cccc-4ccc-cccc-000000000005'),
  'closed',
  'B-5: 開始日が過去・end_date が未来の大会も closed になる (境界は date 側)');

-- -----------------------------------------------------------------------------
-- C. 返り値と冪等性
-- -----------------------------------------------------------------------------
select is(
  (select updated from qa_first_run),
  5,
  'C-1: 初回実行の更新行数は 5 (練習2 + 大会3)');

select is(
  public.close_past_attendance_status(),
  0,
  'C-2: 2回目の実行は 0 行 (冪等)');

-- -----------------------------------------------------------------------------
-- D. 権限とタイムゾーン
-- -----------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.close_past_attendance_status()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.close_past_attendance_status()', 'EXECUTE'),
  'D-1: anon / authenticated は関数を EXECUTE できない (既定の PUBLIC EXECUTE を剥がしている)');

-- 境界は UTC-12 (Anywhere on Earth) でなければならない。これは
-- 「DB で closed」⊆「フロントで closed」という不変条件 (migration 冒頭) の
-- 実装であり、JST や UTC に緩めると 西側 (UTC より遅れる) のタイムゾーンのユーザーが
-- イベント当日に「受付終了」を見せられて出欠を出せなくなる。
-- フィクスチャ側も UTC-12 相対で作っているため挙動テストだけでは JST 実装との
-- 差が 1 日 3 時間の窓でしか出ずフレークする。ここだけは定義を直接見て固定する。
select matches(
  pg_get_functiondef('public.close_past_attendance_status()'::regprocedure),
  '12 hours',
  'D-2: 境界日付は UTC から 12 時間引いて算出している (UTC-12 = Anywhere on Earth)');

select ok(
  pg_get_functiondef('public.close_past_attendance_status()'::regprocedure)
    !~* 'current_date',
  'D-3: CURRENT_DATE (DB既定=UTC) を境界に使っていない (フロントより早く閉じる退行の防止)');

-- -----------------------------------------------------------------------------
-- E. 日次ジョブの登録
--
-- migration は pg_cron が無い環境では NOTICE を出してジョブ登録をスキップする
-- (バックフィルのみ適用)。その環境でここを失敗させると CI/ローカルの差で
-- 常時赤になるため skip に落とす。逆に pg_cron がある環境では
-- 「登録されているつもりで実は未登録」を確実に落とす。
-- -----------------------------------------------------------------------------
select case when exists (select 1 from pg_extension where extname = 'pg_cron')
  then collect_tap(
    is(
      (select count(*)::int from cron.job where jobname = 'close-past-attendance-status'),
      1,
      'E-1: 日次ジョブ close-past-attendance-status が1件だけ登録されている (重複登録なし)'),
    is(
      (select schedule from cron.job where jobname = 'close-past-attendance-status'),
      '5 12 * * *',
      'E-2: スケジュールは UTC 12:05 = UTC-12 の 00:05 (cron.timezone は GMT)')
  )
  else collect_tap(
    skip('pg_cron 無効環境のためジョブ登録の検証をスキップ', 2)
  )
end;

select * from finish();
rollback;
