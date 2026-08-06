-- =============================================================================
-- pgTAP: セキュリティ監査 High 4件 (C-1/C-2/C-3/C-4) の実DB検証
--
-- 対象:
--   - C-3/C-4 (20260803000001_atomic_usage_reservation_rpc.sql):
--     reserve_guest_scan / release_guest_scan / reserve_user_daily_usage /
--     release_user_daily_usage の GRANT 境界・Premium 判定境界・冪等性。
--   - C-1 (video-authz.ts + records/practice_logs RLS): 動画削除authz とRLSの
--     実際の整合性。record は一致することを確認し、practice_logs は「本人」判定が
--     ヘルパ (practice_logs.user_id) と RLS (practices.user_id=作成者) とで
--     異なる列を見ているため、正当な自己所有ログの操作でも RLS が 0 行更新に
--     なり得ることを実測する (video-authz.ts のモックベース単体テストでは
--     検出できない。RLS を無効化したフェイク DB では再現しないため)。
--
-- 方針: Supabase クライアントをモックせず、role / JWT クレームの切替で実際の
-- RLS / GRANT / RPC を評価する (01〜04 と同じ型)。
--
-- 実行: ローカル Supabase 起動済み (supabase start) の状態で `supabase test db`。
--       全フィクスチャは rollback で消える。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(42);

-- -----------------------------------------------------------------------------
-- ヘルパー: JWT クレーム + ロール切替 (既存テストと同一定義。rollback で消える)
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

-- H 節で使用: UPDATE を試行し、実際の挙動を 'rows=N' (件数) か 'error=<SQLSTATE>' として
-- 明示的に返す。RLS が「0行更新」になるのか「WITH CHECK 違反エラー」になるのかを
-- 暗黙の例外伝播に頼らず判別するためのヘルパー (SECURITY INVOKER: RLS はそのまま効く)。
create function public.qa_try_update(p_sql text) returns text language plpgsql as $$
declare
  v_rows int;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  return 'rows=' || v_rows;
exception when others then
  return 'error=' || sqlstate;
end $$;

-- =============================================================================
-- フィクスチャ: C-1 検証用 (coach = チーム作成者/admin, swimmer = 練習/記録の owner)
-- =============================================================================
insert into auth.users (id, email) values
  ('66666666-6666-4666-a666-000000000001', 'qa-authz-coach@example.test'),
  ('66666666-6666-4666-a666-000000000002', 'qa-authz-swimmer@example.test'),
  ('66666666-6666-4666-a666-000000000003', 'qa-authz-retired@example.test');

insert into public.users (id, name)
select id, email from auth.users
where id in (
  '66666666-6666-4666-a666-000000000001',
  '66666666-6666-4666-a666-000000000002',
  '66666666-6666-4666-a666-000000000003')
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('66666666-6666-4666-a666-000000000010', 'QA Authz Team', 'QA-AUTHZ-T1-CODE', '66666666-6666-4666-a666-000000000001');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at, left_at) values
  ('66666666-6666-4666-a666-000000000010', '66666666-6666-4666-a666-000000000001', 'admin', 'approved', true, '2026-01-01', null),
  ('66666666-6666-4666-a666-000000000010', '66666666-6666-4666-a666-000000000002', 'user', 'approved', true, '2026-01-01', null),
  -- retired: かつてteam1に所属していたが退会済み (is_active=false)
  ('66666666-6666-4666-a666-000000000010', '66666666-6666-4666-a666-000000000003', 'user', 'approved', false, '2026-01-01', '2026-06-01');

-- チーム記録 (records): swimmer 所有・team_id あり
insert into public.records (id, user_id, team_id, style_id, time, pool_type, video_path) values
  ('66666666-6666-4666-a666-000000000020', '66666666-6666-4666-a666-000000000002', '66666666-6666-4666-a666-000000000010', 1, 30.00, 0, 'videos/qa-record-active.mp4');

-- 退会済みメンバーの過去記録
insert into public.records (id, user_id, team_id, style_id, time, pool_type, video_path) values
  ('66666666-6666-4666-a666-000000000021', '66666666-6666-4666-a666-000000000003', '66666666-6666-4666-a666-000000000010', 1, 31.00, 0, 'videos/qa-record-retired.mp4');

-- チーム練習 (practices): coach が作成 (practices.user_id = coach)、swimmer がログ所有者
select public.qa_login_as('66666666-6666-4666-a666-000000000001');
insert into public.practices (id, user_id, team_id, date) values
  ('66666666-6666-4666-a666-000000000030', '66666666-6666-4666-a666-000000000001', '66666666-6666-4666-a666-000000000010', current_date);
select public.qa_logout();

insert into public.practice_logs (id, user_id, practice_id, style, rep_count, set_count, distance, video_path) values
  ('66666666-6666-4666-a666-000000000040', '66666666-6666-4666-a666-000000000002', '66666666-6666-4666-a666-000000000030', 'Fr', 1, 1, 50, 'videos/qa-practicelog-active.mp4');

-- =============================================================================
-- A. C-1 records: RLS の「本人」「代理」判定は authorizeRecordVideoMutation と同じ列を使う
-- =============================================================================

-- A-1: swimmer (本人) は自分の記録を直接 UPDATE できる (RLS = records.user_id、authz も records.user_id → 一致)
select public.qa_login_as('66666666-6666-4666-a666-000000000002');
select lives_ok(
  $$ update public.records set video_path = null where id = '66666666-6666-4666-a666-000000000020' and user_id = auth.uid() $$,
  'A-1: swimmer は自分の記録の video_path を直接 UPDATE できる (RLS 本人判定 = records.user_id)');
select public.qa_logout();

select is(
  (select video_path from public.records where id = '66666666-6666-4666-a666-000000000020'),
  null,
  'A-2: A-1 の UPDATE は実際に反映されている (0 行更新の見せかけ成功ではない)');

-- A-3: coach (active admin) は active member (swimmer) の記録を代理 UPDATE できる (RLS 代理条件と authz が一致)
select public.qa_login_as('66666666-6666-4666-a666-000000000001');
select lives_ok(
  $$ update public.records set video_thumbnail_path = null where id = '66666666-6666-4666-a666-000000000020' $$,
  'A-3: active admin は active member の記録を代理 UPDATE できる (RLS 代理条件)');
select public.qa_logout();

-- A-4/A-5: coach (active admin) は退会済みメンバーの記録を代理 UPDATE できない (RLS が 0 行更新でブロック)
-- = authorizeRecordVideoMutation の W-a (対象 owner が active member であること) と一致することの実測。
select public.qa_login_as('66666666-6666-4666-a666-000000000001');
with upd as (
  update public.records set video_path = null
  where id = '66666666-6666-4666-a666-000000000021'
  returning id
)
select is(
  (select count(*)::int from upd),
  0,
  'A-4: active admin であっても退会済みメンバーの記録は RLS により 0 行更新 (代理不可)');
select public.qa_logout();

select is(
  (select video_path from public.records where id = '66666666-6666-4666-a666-000000000021'),
  'videos/qa-record-retired.mp4',
  'A-5: A-4 の攻撃(代理)後も退会済みメンバーの記録の video_path は変更されていない (= 修正後は403でR2も消えないはずの前提が成立)');

-- =============================================================================
-- B. C-1 practice_logs: 「本人」判定のヘルパ (log.user_id) と RLS の一致 (2026-08-03 解消)
--
-- [従来の食い違い] authorizePracticeLogVideoMutation は log.user_id === callerId を「本人」として
-- ok:true を返すが、旧 RLS (Practice logs update policy の「本人」枝) は practices.user_id
-- (= 練習の作成者) のみを見ており、practice_logs.user_id (ログ所有者) とは食い違っていた。
-- coach が practices を作成し、swimmer がその中の practice_log の所有者である場合、authz は
-- ok:true を返すが RLS の UPDATE は 0 行になる不整合があった。
--
-- [2026-08-03 プロダクト判断で解消] migration 20260803000002_practice_logs_owner_self_update.sql
-- により「ログ所有者本人 (practice_logs.user_id = auth.uid())」の枝がトップレベル OR として
-- 追加され、上記の不一致は解消した。以下の B-1/B-2 はこの解消そのものを実測する
-- (旧: 「RLS が 0 行更新でブロックする」ことの実測 → 新: 選手本人の UPDATE が実際に反映されることの実測)。
-- practice_id / user_id の付け替え防御 (新設した WITH CHECK) は G 節、退会済みメンバーの
-- ケースは H 節で別途検証する。
-- =============================================================================

select public.qa_login_as('66666666-6666-4666-a666-000000000002'); -- swimmer (自分のログの所有者、practice の作成者ではない)
with upd as (
  update public.practice_logs set video_path = null, video_thumbnail_path = null
  where id = '66666666-6666-4666-a666-000000000040'
  returning id
)
select is(
  (select count(*)::int from upd),
  1,
  'B-1 [2026-08-03 反転]: swimmer は自分の practice_log (log.user_id=本人) を、practice の作成者でなくても UPDATE できる (20260803000002 でログ所有者本人の枝が追加され、旧仕様の0行ブロックは解消された)');
select public.qa_logout();

select is(
  (select video_path from public.practice_logs where id = '66666666-6666-4666-a666-000000000040'),
  null,
  'B-2 [2026-08-03 反転]: B-1 の UPDATE は実際に反映されている (video_path が null に更新済み。見せかけの成功ではない)');

-- B-3: 一方 practice の作成者 (coach) 自身なら RLS の「本人」枝が通る (これが RLS 側の「本人」の実体)
select public.qa_login_as('66666666-6666-4666-a666-000000000001'); -- coach (practices.user_id = coach)
select lives_ok(
  $$ update public.practice_logs set video_thumbnail_path = null where id = '66666666-6666-4666-a666-000000000040' $$,
  'B-3: practices.user_id (practice 作成者) である coach は同じ行を UPDATE できる (RLS の「本人」は practice 作成者を指しており practice_logs.user_id ではないことの確認)');
select public.qa_logout();

-- =============================================================================
-- G. 20260803000002 practice_logs owner-self UPDATE の WITH CHECK 実測
--    (Developer 申告: user_id / practice_id の付け替えは WITH CHECK で防がれる。
--     同一チーム内の別 practice への付け替えは許容する設計、と申告されている点を実測する)
-- =============================================================================

insert into auth.users (id, email) values
  ('77777777-7777-4777-b777-000000000001', 'qa-g-home-coach@example.test'),
  ('77777777-7777-4777-b777-000000000002', 'qa-g-home-swimmer@example.test'),
  ('77777777-7777-4777-b777-000000000003', 'qa-g-foreign-coach@example.test'),
  ('77777777-7777-4777-b777-000000000004', 'qa-g-retired@example.test');

insert into public.users (id, name)
select id, email from auth.users
where id in (
  '77777777-7777-4777-b777-000000000001',
  '77777777-7777-4777-b777-000000000002',
  '77777777-7777-4777-b777-000000000003',
  '77777777-7777-4777-b777-000000000004')
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('77777777-7777-4777-b777-000000000010', 'QA G Home Team', 'QA-G-HOME-CODE', '77777777-7777-4777-b777-000000000001'),
  ('77777777-7777-4777-b777-000000000011', 'QA G Foreign Team', 'QA-G-FOREIGN-CODE', '77777777-7777-4777-b777-000000000003');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at, left_at) values
  ('77777777-7777-4777-b777-000000000010', '77777777-7777-4777-b777-000000000001', 'admin', 'approved', true, '2026-01-01', null),
  ('77777777-7777-4777-b777-000000000010', '77777777-7777-4777-b777-000000000002', 'user', 'approved', true, '2026-01-01', null),
  -- retired: home_team にかつて所属していたが退会済み (is_active=false)。H 節で使用。
  ('77777777-7777-4777-b777-000000000010', '77777777-7777-4777-b777-000000000004', 'user', 'approved', false, '2026-01-01', '2026-06-01'),
  ('77777777-7777-4777-b777-000000000011', '77777777-7777-4777-b777-000000000003', 'admin', 'approved', true, '2026-01-01', null);

-- home_team 内に2つの practice (home_coach 作成)、foreign_team に1つ (foreign_coach 作成)
select public.qa_login_as('77777777-7777-4777-b777-000000000001');
insert into public.practices (id, user_id, team_id, date) values
  ('77777777-7777-4777-b777-000000000030', '77777777-7777-4777-b777-000000000001', '77777777-7777-4777-b777-000000000010', current_date),
  ('77777777-7777-4777-b777-000000000031', '77777777-7777-4777-b777-000000000001', '77777777-7777-4777-b777-000000000010', current_date),
  ('77777777-7777-4777-b777-000000000033', '77777777-7777-4777-b777-000000000001', '77777777-7777-4777-b777-000000000010', current_date);
select public.qa_logout();

select public.qa_login_as('77777777-7777-4777-b777-000000000003');
insert into public.practices (id, user_id, team_id, date) values
  ('77777777-7777-4777-b777-000000000032', '77777777-7777-4777-b777-000000000003', '77777777-7777-4777-b777-000000000011', current_date);
select public.qa_logout();

-- 攻撃対象ログ: home_swimmer 所有、home_team の practice_home_1 に属する
insert into public.practice_logs (id, user_id, practice_id, style, rep_count, set_count, distance, video_path) values
  ('77777777-7777-4777-b777-000000000040', '77777777-7777-4777-b777-000000000002', '77777777-7777-4777-b777-000000000030', 'Fr', 1, 1, 50, 'videos/qa-g-attack.mp4');

-- G-1: home_swimmer は自分のログの user_id を他人 (home_coach) に書き換えられない
select public.qa_login_as('77777777-7777-4777-b777-000000000002');
select throws_ok(
  $$ update public.practice_logs set user_id = '77777777-7777-4777-b777-000000000001' where id = '77777777-7777-4777-b777-000000000040' $$,
  '42501', null,
  'G-1: swimmer は自分の practice_log の user_id を他人に付け替えられない (WITH CHECK が RLS 違反エラーで拒否)');
select public.qa_logout();

select is(
  (select user_id from public.practice_logs where id = '77777777-7777-4777-b777-000000000040'),
  '77777777-7777-4777-b777-000000000002'::uuid,
  'G-2: G-1 の攻撃後も user_id は変更されていない (エラーになりロールバックされ、部分反映もない)');

-- G-3: home_swimmer は自分のログの practice_id を、無関係な他チーム (foreign_team) の practice に付け替えられない
select public.qa_login_as('77777777-7777-4777-b777-000000000002');
select throws_ok(
  $$ update public.practice_logs set practice_id = '77777777-7777-4777-b777-000000000032' where id = '77777777-7777-4777-b777-000000000040' $$,
  '42501', null,
  'G-3: swimmer は自分の practice_log を無関係な他チームの practice に付け替えられない (他チームへのログ汚染をWITH CHECKが拒否)');
select public.qa_logout();

select is(
  (select practice_id from public.practice_logs where id = '77777777-7777-4777-b777-000000000040'),
  '77777777-7777-4777-b777-000000000030'::uuid,
  'G-4: G-3 の攻撃後も practice_id は変更されていない');

-- G-5: 一方、同一チーム内の別 practice への付け替えは Developer の申告どおり許容される (意図した仕様上の緩さ)
select public.qa_login_as('77777777-7777-4777-b777-000000000002');
select lives_ok(
  $$ update public.practice_logs set practice_id = '77777777-7777-4777-b777-000000000031' where id = '77777777-7777-4777-b777-000000000040' $$,
  'G-5: swimmer は自分の practice_log を同一チーム内の別 practice には付け替えられる (Developer 申告どおりの設計上の許容範囲)');
select public.qa_logout();

select is(
  (select practice_id from public.practice_logs where id = '77777777-7777-4777-b777-000000000040'),
  '77777777-7777-4777-b777-000000000031'::uuid,
  'G-6: G-5 の付け替えは実際に反映されている (同一チーム内移動は正常に成功する)');

-- =============================================================================
-- H. 退会済みメンバーの自己 UPDATE (Developer 申告の実測: 退会済みメンバーが自分の過去ログを
--    更新しようとすると 0 行更新になる、という点を実測する)
--
-- 実体の確認: practice_logs の SELECT ポリシー ("Users can view practice_logs") は
-- practices.user_id=自分 OR is_team_member(team_id, 自分) を要求し、is_team_member は
-- is_active=true を要求する (定義を実測で確認済み)。退会済みメンバーは practice の作成者でも
-- active member でもないため、UPDATE 対象行の候補として可視化されない時点で 0 行になる
-- (WITH CHECK 違反によるエラーではなく、行が見えないことによる無害な0行)。
-- =============================================================================

insert into public.practice_logs (id, user_id, practice_id, style, rep_count, set_count, distance, video_path) values
  ('77777777-7777-4777-b777-000000000041', '77777777-7777-4777-b777-000000000004', '77777777-7777-4777-b777-000000000030', 'Fr', 1, 1, 50, 'videos/qa-h-retired.mp4');

select public.qa_login_as('77777777-7777-4777-b777-000000000004'); -- retired (home_team を退会済み、is_active=false)
select is(
  public.qa_try_update($$ update public.practice_logs set video_path = null where id = '77777777-7777-4777-b777-000000000041' $$),
  'rows=0',
  'H-1 [重要]: 退会済み (is_active=false) メンバーが自分の過去ログの video_path を更新しようとすると 0 行更新になる (エラーにはならない。practice_logs の SELECT ポリシーが team active member でない対象行を候補として可視化しないため、WITH CHECK 到達前に0件になる)');
select public.qa_logout();

select is(
  (select video_path from public.practice_logs where id = '77777777-7777-4777-b777-000000000041'),
  'videos/qa-h-retired.mp4',
  'H-2: H-1 の後も video_path は変更されていない (0行更新は見せかけではなく実際に無変更)');

-- H-3/H-4: [対比・非対称の裏付け] records の「本人」枝 ((select auth.uid()) = user_id) は
-- team_memberships を一切参照しない (20260129000000_optimize_rls_policies.sql:195-217)。
-- そのため退会済みメンバーでも「自分の」record は team 状態に関わらず自己 UPDATE できる。
-- 20260803000002 のコメントは「practice_logs を records と同じ非対称のない形に揃える」と
-- 主張しているが、退会済みメンバーに関しては records (H-3=1行成功) と practice_logs (H-1=0行)
-- とで挙動が異なり、この主張は完全には成立していない。既存の qa-authz-retired
-- (66666666-...-003, team010 を退会済み) 所有の record (id ...021, A-4/A-5 で使用済み) を再利用する。
select public.qa_login_as('66666666-6666-4666-a666-000000000003'); -- retired (records.user_id=本人、team010 を退会済み)
with upd as (
  update public.records set video_path = null
  where id = '66666666-6666-4666-a666-000000000021'
  returning id
)
select is(
  (select count(*)::int from upd),
  1,
  'H-3 [非対称の裏付け]: records の「本人」枝は team_memberships を参照しないため、退会済みメンバーでも自分の record は自己 UPDATE できる (H-1 の practice_logs 自己UPDATE 0行との非対称。20260803000002 のコメントが主張する「records と同じ非対称のない形に揃える」は退会済みメンバーに関しては成立していない)');
select public.qa_logout();

select is(
  (select video_path from public.records where id = '66666666-6666-4666-a666-000000000021'),
  null,
  'H-4: H-3 の UPDATE は実際に反映されている');

-- =============================================================================
-- I. コーチ一括入力 (replace_practice_logs RPC, SECURITY DEFINER) は本 migration の影響を受けない
--    (RLS を経由せず、関数内で DELETE + INSERT を行い独自に認可するため)
-- =============================================================================

select public.qa_login_as('77777777-7777-4777-b777-000000000001'); -- home_coach (team admin)
select ok(
  (
    (public.replace_practice_logs(
      '77777777-7777-4777-b777-000000000033'::uuid,
      jsonb_build_array(jsonb_build_object(
        'user_id', '77777777-7777-4777-b777-000000000002',
        'style', 'Fr',
        'rep_count', 4,
        'set_count', 2,
        'distance', 50
      ))
    )->>'success')::boolean
  ),
  'I-1: replace_practice_logs (SECURITY DEFINER, RLS非経由) はコーチによる代理一括入力に成功する (本 migration による回帰なし)');
select public.qa_logout();

select is(
  (select count(*)::int from public.practice_logs
   where practice_id = '77777777-7777-4777-b777-000000000033'
   and user_id = '77777777-7777-4777-b777-000000000002'),
  1,
  'I-2: I-1 で挿入されたログが実際に practice_logs に存在する (success フラグだけの見せかけではない)');

-- =============================================================================
-- C. C-3: reserve_guest_scan / release_guest_scan の GRANT 境界
-- =============================================================================

select ok(
  not has_function_privilege('authenticated', 'public.reserve_guest_scan(text, date)', 'EXECUTE'),
  'C-1: authenticated は reserve_guest_scan を EXECUTE できない');

select ok(
  not has_function_privilege('authenticated', 'public.release_guest_scan(text, date)', 'EXECUTE'),
  'C-2 [重点]: authenticated は release_guest_scan を EXECUTE できない (これが漏れると無料枠の自己リセット穴が再び開く)');

select ok(
  not has_function_privilege('anon', 'public.reserve_guest_scan(text, date)', 'EXECUTE'),
  'C-3: anon は reserve_guest_scan を EXECUTE できない');

select ok(
  not has_function_privilege('anon', 'public.release_guest_scan(text, date)', 'EXECUTE'),
  'C-4: anon は release_guest_scan を EXECUTE できない');

select public.qa_login_anon();
select throws_ok(
  $$ select * from public.release_guest_scan('deadbeef', current_date) $$,
  '42501', null,
  'C-5: anon ロールが release_guest_scan を直接呼んでも GRANT 層で拒否される (実行して確認)');
select public.qa_logout();

-- =============================================================================
-- D. C-4: reserve_user_daily_usage / release_user_daily_usage の GRANT 境界
--    (最重点: release_* が authenticated から叩けると C-1 で塞いだ自己リセット穴が再び開く)
-- =============================================================================

select ok(
  not has_function_privilege('authenticated', 'public.reserve_user_daily_usage(uuid, app_id, date)', 'EXECUTE'),
  'D-1: authenticated は reserve_user_daily_usage を EXECUTE できない');

select ok(
  not has_function_privilege('authenticated', 'public.release_user_daily_usage(uuid, app_id, date)', 'EXECUTE'),
  'D-2 [最重点]: authenticated は release_user_daily_usage を EXECUTE できない');

select public.qa_login_as('66666666-6666-4666-a666-000000000002');
select throws_ok(
  $$ select * from public.release_user_daily_usage(auth.uid(), 'swimhub_scanner'::app_id, current_date) $$,
  '42501', null,
  'D-3 [最重点・実行確認]: authenticated ユーザーが自分自身の user_id で release_user_daily_usage を直接連打しても拒否される (自己リセット攻撃の再実測)');

select throws_ok(
  $$ select * from public.reserve_user_daily_usage(auth.uid(), 'swimhub_scanner'::app_id, current_date) $$,
  '42501', null,
  'D-4: authenticated ユーザーが reserve_user_daily_usage を直接呼んでも拒否される');
select public.qa_logout();

-- D-5: p_limit のような上限値注入用の引数が存在しないこと (関数シグネチャで裏付け)
select is(
  (select pg_get_function_arguments('public.reserve_user_daily_usage(uuid, app_id, date)'::regprocedure)),
  'p_user_id uuid, p_app app_id, p_usage_date date',
  'D-5: reserve_user_daily_usage のシグネチャに p_limit 相当の引数が無い (上限は関数内部で導出)');

-- =============================================================================
-- E. Premium 判定境界 (checkIsPremium と同一ロジックであること) と使用実績の記録継続
-- =============================================================================

insert into auth.users (id, email) values
  ('66666666-6666-4666-a666-000000000004', 'qa-premium-active@example.test'),
  ('66666666-6666-4666-a666-000000000005', 'qa-premium-expired-just-now@example.test'),
  ('66666666-6666-4666-a666-000000000006', 'qa-premium-not-yet-expired@example.test'),
  ('66666666-6666-4666-a666-000000000007', 'qa-premium-canceled@example.test'),
  ('66666666-6666-4666-a666-000000000008', 'qa-free-user@example.test');

insert into public.users (id, name)
select id, email from auth.users
where id in (
  '66666666-6666-4666-a666-000000000004',
  '66666666-6666-4666-a666-000000000005',
  '66666666-6666-4666-a666-000000000006',
  '66666666-6666-4666-a666-000000000007',
  '66666666-6666-4666-a666-000000000008')
on conflict (id) do nothing;

-- premium_expires_at が無い (無期限) premium/active
update public.user_subscriptions set plan = 'premium', status = 'active', premium_expires_at = null
  where id = '66666666-6666-4666-a666-000000000004';
-- premium だが premium_expires_at がちょうど過去 (境界: 期限切れ直後) → Free 扱いになるべき
update public.user_subscriptions set plan = 'premium', status = 'active', premium_expires_at = now() - interval '1 second'
  where id = '66666666-6666-4666-a666-000000000005';
-- premium で premium_expires_at がまだ未来 (境界: 期限切れ直前) → Premium 扱いのまま
update public.user_subscriptions set plan = 'premium', status = 'active', premium_expires_at = now() + interval '1 second'
  where id = '66666666-6666-4666-a666-000000000006';
-- status = canceled (active/trialing 以外) → Free 扱い
update public.user_subscriptions set plan = 'premium', status = 'canceled', premium_expires_at = now() + interval '30 days'
  where id = '66666666-6666-4666-a666-000000000007';
-- 素の free ユーザー
update public.user_subscriptions set plan = 'free', status = null
  where id = '66666666-6666-4666-a666-000000000008';

-- E-1: 無期限 premium は allowed=true, is_premium=true (何度呼んでも上限に引っかからない)
select results_eq(
  $$ select allowed, is_premium from public.reserve_user_daily_usage(
       '66666666-6666-4666-a666-000000000004'::uuid, 'swimhub_scanner'::app_id, current_date) $$,
  $$ values (true, true) $$,
  'E-1: 無期限 Premium (premium_expires_at IS NULL) は allowed=true, is_premium=true');

select results_eq(
  $$ select allowed, is_premium from public.reserve_user_daily_usage(
       '66666666-6666-4666-a666-000000000004'::uuid, 'swimhub_scanner'::app_id, current_date) $$,
  $$ values (true, true) $$,
  'E-2: 無期限 Premium は2回目呼び出しでも allowed=true のまま (上限バイパス)');

select is(
  (select daily_tokens_used from public.app_daily_usage
   where user_id = '66666666-6666-4666-a666-000000000004' and app = 'swimhub_scanner' and usage_date = current_date),
  2,
  'E-3: Premium でも使用実績 (daily_tokens_used) は 2 回とも記録され続けている (上限バイパスするが記録は止めない)');

-- E-4: premium_expires_at が「ちょうど」過去 (境界: 期限切れ直後) は Free 扱いになり、1回目は allowed=true (Free枠消費) だが2回目は false
select results_eq(
  $$ select allowed, is_premium from public.reserve_user_daily_usage(
       '66666666-6666-4666-a666-000000000005'::uuid, 'swimhub_scanner'::app_id, current_date) $$,
  $$ values (true, false) $$,
  'E-4: premium_expires_at が過去 (期限切れ) の premium は is_premium=false (Free 扱い、checkIsPremium と同じ境界)');

select results_eq(
  $$ select allowed, is_premium from public.reserve_user_daily_usage(
       '66666666-6666-4666-a666-000000000005'::uuid, 'swimhub_scanner'::app_id, current_date) $$,
  $$ values (false, false) $$,
  'E-5: 期限切れ premium (=Free扱い) は Free 上限(1)に達しているため2回目は allowed=false');

-- E-6: premium_expires_at が「まだ未来」(境界: 期限切れ直前) は Premium 扱いのまま
select results_eq(
  $$ select allowed, is_premium from public.reserve_user_daily_usage(
       '66666666-6666-4666-a666-000000000006'::uuid, 'swimhub_scanner'::app_id, current_date) $$,
  $$ values (true, true) $$,
  'E-6: premium_expires_at がまだ未来 (期限切れ直前) の premium は is_premium=true のまま (checkIsPremium と同じ境界)');

-- E-7: status='canceled' は active/trialing に含まれないため Free 扱い
select results_eq(
  $$ select allowed, is_premium from public.reserve_user_daily_usage(
       '66666666-6666-4666-a666-000000000007'::uuid, 'swimhub_scanner'::app_id, current_date) $$,
  $$ values (true, false) $$,
  'E-7: status=canceled の premium プランは is_premium=false (Free 扱い、checkIsPremium と同じ)');

-- E-8: 素の Free ユーザーは1回目 allowed=true、2回目 allowed=false (無料枠1)
select results_eq(
  $$ select allowed, is_premium from public.reserve_user_daily_usage(
       '66666666-6666-4666-a666-000000000008'::uuid, 'swimhub_scanner'::app_id, current_date) $$,
  $$ values (true, false) $$,
  'E-8: Free ユーザーの1回目 reserve は allowed=true, is_premium=false');

select results_eq(
  $$ select allowed, is_premium from public.reserve_user_daily_usage(
       '66666666-6666-4666-a666-000000000008'::uuid, 'swimhub_scanner'::app_id, current_date) $$,
  $$ values (false, false) $$,
  'E-9: Free ユーザーの2回目 reserve は allowed=false (無料枠1を使い切り済み)');

-- =============================================================================
-- F. 解放の冪等性・負数ガード
-- =============================================================================

-- F-1: release_user_daily_usage を複数回呼んでも daily_tokens_used は 0 未満にならない
select public.release_user_daily_usage('66666666-6666-4666-a666-000000000008'::uuid, 'swimhub_scanner'::app_id, current_date);
select public.release_user_daily_usage('66666666-6666-4666-a666-000000000008'::uuid, 'swimhub_scanner'::app_id, current_date);
select public.release_user_daily_usage('66666666-6666-4666-a666-000000000008'::uuid, 'swimhub_scanner'::app_id, current_date);

select is(
  (select daily_tokens_used from public.app_daily_usage
   where user_id = '66666666-6666-4666-a666-000000000008' and app = 'swimhub_scanner' and usage_date = current_date),
  0,
  'F-1: 1回分しか予約していなくても release を3回連打して daily_tokens_used が負数にならない (GREATEST(x-1,0) ガード)');

-- F-2: 解放後は Free ユーザーが再度 reserve できる (枠が正しく戻っている)
select results_eq(
  $$ select allowed from public.reserve_user_daily_usage(
       '66666666-6666-4666-a666-000000000008'::uuid, 'swimhub_scanner'::app_id, current_date) $$,
  $$ values (true) $$,
  'F-2: release 後は Free ユーザーが再度 reserve できる (枠が正しく戻っている)');

-- F-3: reserve_guest_scan / release_guest_scan も同様に負数にならない
select public.reserve_guest_scan('qa-guest-idem-hash', current_date);
select public.release_guest_scan('qa-guest-idem-hash', current_date);
select public.release_guest_scan('qa-guest-idem-hash', current_date);
select public.release_guest_scan('qa-guest-idem-hash', current_date);

select is(
  (select count from public.guest_scan_daily_usage where ip_hash = 'qa-guest-idem-hash' and usage_date = current_date),
  0,
  'F-3: ゲスト予約1回に対し release を3回連打しても count が負数にならない');

select * from finish();
rollback;
