-- =============================================================================
-- pgTAP: goals テーブル RLS + competition_id スコープ検証 (回帰固定)
--
-- 対象 migration (目標管理 本導入):
--   - 20260929000000_goals_optional_competition_and_reflection_note.sql
--     (P1: competition_id nullable化 + FK ON DELETE SET NULL /
--      P2: INSERT/UPDATE WITH CHECK に competition_id 所有・可視性チェック追加 /
--      P3: reflection_note 列追加)
--   - 20260929000001_delete_competition_with_records_also_deletes_goals.sql
--     (delete_competition_with_records RPC の個人大会分岐で goals も削除。
--      本ファイルでは RPC 自体は対象外。RPC の検証は
--      10_delete_competition_with_records_rpc.test.sql の責務。
--      本ファイルは生 SQL レベルの FK ON DELETE SET NULL 挙動のみを見る)
--
-- 方針:
--   - team_memberships の pgTAP (01_team_memberships_rls.test.sql) と同じ
--     qa_login_as / qa_login_anon / qa_logout ヘルパーを流用する。
--   - 攻撃 SQL は GoalAPI を介さない from("goals") 直叩きを模す。
--   - 期待値は「攻撃者視点で何が起きるべきか」から書く。実装のクエリ文言を
--     そのまま転記しない (トートロジー回避)。
--
-- 【Phase A スケルトンからの更新点 (契約確定版との齟齬解消)】
--   Phase A スケルトンの TODO (B-4) は「competition_id = NULL の goal の INSERT が
--   成功する」ことを想定していたが、実際に適用された migration の INSERT WITH CHECK は
--   `competition_id IS NOT NULL AND EXISTS(...)` であり、INSERT 時点で NULL は
--   明示的に拒否される (P2 の設計)。NULL 化は UPDATE または FK の ON DELETE SET NULL
--   経由でのみ起こりうる。本ファイルはこの最終仕様 (実際に適用された migration) を
--   正として書く。Sprint Contract 本文 (P2) の記述と一致することを確認済み。
--
-- 実行: ローカル Supabase 起動済み・本ファイル対象の2 migration 適用済みの状態で
--       直接 `psql -f` 実行する (09番同様、supabase test db ラッパーは既知の偽赤
--       パターンがあるため、直接実行結果を正とする)。全フィクスチャは
--       begin;...rollback; で消える。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

-- -----------------------------------------------------------------------------
-- ヘルパー: JWT クレーム + ロール切替 (01番と同一定義。rollback で消える)
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
-- フィクスチャ方針 (postgres = BYPASSRLS で投入)
--   user_a:  team1 の一般メンバー (approved/active)。goal_a_on_team1 / goal_a_second /
--            goal_a_third を所有。
--   user_b:  team1・team2 いずれにも非所属 (outsider)。自分の個人大会 comp_personal_b
--            を対象にした goal_b_private を持つ。
--   admin_1: team1 の作成者/管理者 (teams.created_by。DELETE FROM auth.users は
--            行わない。既知の enforce_teams_identity_immutable トリガー問題
--            (project_swimhub_pgtap_baseline_two_reds.md 06/13番) を本テストに
--            巻き込まないため)。
--   admin_2: team2 (user_a が非所属のチーム) の作成者/管理者。
--   team1:   user_a が一般メンバーとして所属。
--   team2:   user_a が所属しないチーム (「非所属チームの大会」の攻撃対象)。
--   comp_team1:         team1 所属の大会 (team_id = team1)
--   comp_outsider_team: user_a が所属しない team2 の大会
--   comp_personal_a:    user_a 自身が作成した個人大会 (team_id は null)
--   comp_personal_b:    user_b 自身が作成した個人大会
--   goal_a_on_team1: user_a が comp_team1 を対象に作成した goal (A/D/E-1 で使用)
--   goal_a_second:   user_a が comp_personal_a を対象に作成した goal (C-3 専用)
--   goal_a_third:    user_a が comp_personal_a を対象に作成した goal (E-2 専用。
--                    goal_a_second と同じ competition だが style_id を変えて
--                    unique_user_competition_style 制約を回避する)
--   goal_b_private:  user_b が comp_personal_b を対象に作成した goal (無関係確認用)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('55555555-5555-4555-a555-000000000001', 'qa-goals-user-a@example.test'),
  ('55555555-5555-4555-a555-000000000002', 'qa-goals-user-b@example.test'),
  ('55555555-5555-4555-a555-000000000003', 'qa-goals-admin-1@example.test'),
  ('55555555-5555-4555-a555-000000000004', 'qa-goals-admin-2@example.test');

insert into public.users (id, name)
select id, email from auth.users
where id in (
  '55555555-5555-4555-a555-000000000001',
  '55555555-5555-4555-a555-000000000002',
  '55555555-5555-4555-a555-000000000003',
  '55555555-5555-4555-a555-000000000004')
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('66666666-6666-4666-a666-000000000001', 'QA Goals Team1', 'QA-GOALS-T1-CODE', '55555555-5555-4555-a555-000000000003'),
  ('66666666-6666-4666-a666-000000000002', 'QA Goals Team2 (outsider)', 'QA-GOALS-T2-CODE', '55555555-5555-4555-a555-000000000004');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at, left_at) values
  ('66666666-6666-4666-a666-000000000001', '55555555-5555-4555-a555-000000000003', 'admin', 'approved', true, '2026-01-01', null),
  ('66666666-6666-4666-a666-000000000001', '55555555-5555-4555-a555-000000000001', 'user',  'approved', true, '2026-02-01', null),
  ('66666666-6666-4666-a666-000000000002', '55555555-5555-4555-a555-000000000004', 'admin', 'approved', true, '2026-01-01', null);

insert into public.competitions (id, title, date, pool_type, team_id, user_id, created_by) values
  ('77777777-7777-4777-a777-000000000001', 'QA Goals Team1 Meet', '2027-03-01', 1,
    '66666666-6666-4666-a666-000000000001', null, '55555555-5555-4555-a555-000000000003'),
  ('77777777-7777-4777-a777-000000000002', 'QA Goals Team2 Meet (outsider)', '2027-03-01', 1,
    '66666666-6666-4666-a666-000000000002', null, '55555555-5555-4555-a555-000000000004'),
  ('77777777-7777-4777-a777-000000000003', 'QA Goals Personal A', '2027-04-01', 1,
    null, '55555555-5555-4555-a555-000000000001', '55555555-5555-4555-a555-000000000001'),
  ('77777777-7777-4777-a777-000000000004', 'QA Goals Personal B', '2027-04-01', 0,
    null, '55555555-5555-4555-a555-000000000002', '55555555-5555-4555-a555-000000000002');

insert into public.goals (id, user_id, competition_id, style_id, target_time, start_time, status) values
  ('88888888-8888-4888-a888-000000000001', '55555555-5555-4555-a555-000000000001',
    '77777777-7777-4777-a777-000000000001', 3, 58.00, 62.00, 'active'),
  ('88888888-8888-4888-a888-000000000002', '55555555-5555-4555-a555-000000000001',
    '77777777-7777-4777-a777-000000000003', 3, 58.00, 62.00, 'active'),
  ('88888888-8888-4888-a888-000000000003', '55555555-5555-4555-a555-000000000001',
    '77777777-7777-4777-a777-000000000003', 1, 30.00, 32.00, 'active'),
  ('88888888-8888-4888-a888-000000000004', '55555555-5555-4555-a555-000000000002',
    '77777777-7777-4777-a777-000000000004', 3, 40.00, 44.00, 'active');

-- =============================================================================
-- A. 他人の goal への読み書き拒否 (既存 RLS の回帰確認・新規ではない)
-- =============================================================================
select public.qa_login_as('55555555-5555-4555-a555-000000000002'); -- user_b

select is_empty(
  $$ select * from public.goals where id = '88888888-8888-4888-a888-000000000001' $$,
  'A-1: 他人の goal は SELECT で見えない (0行)');

select is_empty(
  $$ update public.goals set target_time = 1.00
     where id = '88888888-8888-4888-a888-000000000001'
     returning id $$,
  'A-2: 他人の goal への UPDATE はエラーにならず 0 行 (USING で不可視)');

select is_empty(
  $$ delete from public.goals
     where id = '88888888-8888-4888-a888-000000000001'
     returning id $$,
  'A-3: 他人の goal への DELETE もエラーにならず 0 行');

select public.qa_logout();

select is(
  (select target_time from public.goals where id = '88888888-8888-4888-a888-000000000001'),
  58.00::numeric,
  'A-4: 攻撃後も goal_a_on_team1 の target_time は変更されていない (非破壊の裏取り)');

-- =============================================================================
-- B. INSERT 時の competition_id 所有/可視性チェック (P2・新規)
-- =============================================================================
select public.qa_login_as('55555555-5555-4555-a555-000000000001'); -- user_a

select throws_ok(
  $$ insert into public.goals (user_id, competition_id, style_id, target_time, status)
     values (auth.uid(), '77777777-7777-4777-a777-000000000002', 3, 55.00, 'active') $$,
  '42501', null,
  'B-1: 非所属チーム (team2) の大会を competition_id に指定した goal の INSERT は拒否される');

select lives_ok(
  $$ insert into public.goals (user_id, competition_id, style_id, target_time, status)
     values (auth.uid(), '77777777-7777-4777-a777-000000000001', 5, 55.00, 'active') $$,
  'B-2: 所属チーム (team1、一般メンバー権限) の大会を competition_id に指定した goal の INSERT は成功する');

select lives_ok(
  $$ insert into public.goals (user_id, competition_id, style_id, target_time, status)
     values (auth.uid(), '77777777-7777-4777-a777-000000000003', 6, 55.00, 'active') $$,
  'B-3: 自分の個人大会を competition_id に指定した goal の INSERT は成功する (既存の非退行確認)');

select throws_ok(
  $$ insert into public.goals (user_id, competition_id, style_id, target_time, status)
     values (auth.uid(), null, 7, 55.00, 'active') $$,
  '42501', null,
  'B-4: competition_id = NULL の goal の INSERT は拒否される ' ||
  '(P2 の WITH CHECK は competition_id IS NOT NULL を要求する。' ||
  'Phase A スケルトンの想定 (NULL 許可) は最終契約で上書きされている)');

-- =============================================================================
-- C. UPDATE 時の competition_id 所有/可視性チェック (P2・新規)
-- =============================================================================
select throws_ok(
  $$ update public.goals set competition_id = '77777777-7777-4777-a777-000000000002'
     where id = '88888888-8888-4888-a888-000000000001' $$,
  '42501', null,
  'C-1: 自分の goal の competition_id を非所属チームの大会IDに書き換えようとすると拒否される');

select lives_ok(
  $$ update public.goals set target_time = 57.50
     where id = '88888888-8888-4888-a888-000000000001' $$,
  'C-2: target_time のみの更新は、現在の competition_id (comp_team1) が引き続き ' ||
  '可視である限り成功する (非退行)');

select lives_ok(
  $$ update public.goals set competition_id = null
     where id = '88888888-8888-4888-a888-000000000002' $$,
  'C-3: competition_id を NULL に書き換える UPDATE は許可される ' ||
  '(INSERT とは非対称。「大会未定」に戻す操作を想定した設計)');

select public.qa_logout();

select is(
  (select target_time from public.goals where id = '88888888-8888-4888-a888-000000000001'),
  57.50::numeric,
  'C-2 検証: target_time の更新が反映されている');

select is(
  (select competition_id from public.goals where id = '88888888-8888-4888-a888-000000000002'),
  null::uuid,
  'C-3 検証: competition_id が NULL になっている');

-- =============================================================================
-- D. チーム脱退後の境界 (PM裁定の実測)
--    「チーム退会後: 目標は閲覧・削除のみ。編集は RLS で拒否」
-- =============================================================================
-- user_a を team1 から脱退させる (leave() と同じ形状: approved のまま inactive + left_at 記録。
-- 01番の D-1/D-2 と同型。is_team_member は is_active のみを見るため、この時点で
-- comp_team1 は user_a から見えなくなる)。
update public.team_memberships
set is_active = false, left_at = current_date
where team_id = '66666666-6666-4666-a666-000000000001'
  and user_id = '55555555-5555-4555-a555-000000000001';

select public.qa_login_as('55555555-5555-4555-a555-000000000001'); -- user_a (脱退済み)

select isnt_empty(
  $$ select * from public.goals where id = '88888888-8888-4888-a888-000000000001' $$,
  'D-1: 脱退後も自分の goal_a_on_team1 は SELECT できる (0行にならない)');

select throws_ok(
  $$ update public.goals set target_time = 10.00
     where id = '88888888-8888-4888-a888-000000000001' $$,
  '42501', null,
  'D-2: 脱退後、target_time だけを変更する UPDATE も拒否される ' ||
  '(competition_id は触っていないが、comp_team1 が見えなくなった時点で ' ||
  'WITH CHECK が新行全体を再評価し失敗する。「competition_id を触っていないから通る」' ||
  'という誤った期待をしないこと)');

select lives_ok(
  $$ delete from public.goals where id = '88888888-8888-4888-a888-000000000001' $$,
  'D-3: 脱退後も DELETE は成功する (USING は user_id 所有権のみを見るため)');

select public.qa_logout();

select is_empty(
  $$ select * from public.goals where id = '88888888-8888-4888-a888-000000000001' $$,
  'D-4: 脱退後の DELETE が実際に行を削除している (postgres 視点でも0行)');

-- 後続セクションのため user_a を team1 に復帰させる
update public.team_memberships
set is_active = true, left_at = null
where team_id = '66666666-6666-4666-a666-000000000001'
  and user_id = '55555555-5555-4555-a555-000000000001';

-- =============================================================================
-- E. 大会削除時の SET NULL 挙動 (P1・新規)
--    (delete_competition_with_records RPC 自体の検証は 10番の責務。
--     ここでは RPC を経由しない生 DELETE でも FK の ON DELETE SET NULL が
--     一律に効くことを固定する)
-- =============================================================================
-- E-1: チーム大会削除 → 参照している goal が SET NULL になる。
-- goal_a_on_team1 (id ...0001) は D-3 で削除済みだが、B-2 で新規 INSERT した goal
-- (style_id=5) が comp_team1 を参照したまま残っているため、検証用に別途1件追加する。
insert into public.goals (id, user_id, competition_id, style_id, target_time, status) values
  ('88888888-8888-4888-a888-000000000005', '55555555-5555-4555-a555-000000000001',
    '77777777-7777-4777-a777-000000000001', 8, 55.00, 'active');

delete from public.competitions where id = '77777777-7777-4777-a777-000000000001'; -- comp_team1

select is(
  (select competition_id from public.goals where id = '88888888-8888-4888-a888-000000000005'),
  null::uuid,
  'E-1: チーム大会 (comp_team1) を削除すると、参照していた goal は削除されず competition_id が NULL になる');

select is(
  (select count(*)::int from public.goals where id = '88888888-8888-4888-a888-000000000005'),
  1,
  'E-1 検証: goal 自体の行は削除されていない (SET NULL であり CASCADE ではない)');

-- E-2: [契約の穴・要PM裁定] 個人大会を削除した場合も、FK は team/personal を
-- 区別しないため同様に SET NULL される。これはアプリケーション層の RPC
-- (delete_competition_with_records、20260929000001) が「個人大会削除は goals も
-- 削除する」という P1 の方針を別途 DELETE 文で実装しているから成立するのであって、
-- 生 SQL の DELETE FROM competitions を直接叩いた場合はこの安全策を経由しない。
-- pgTAP 上は「現状の FK 契約通り SET NULL になること」を固定しつつ、この非対称
-- (RPC 経由なら消える/生 DELETE なら残る) を PM に一言注記として報告する。
delete from public.competitions where id = '77777777-7777-4777-a777-000000000003'; -- comp_personal_a

select is(
  (select competition_id from public.goals where id = '88888888-8888-4888-a888-000000000003'),
  null::uuid,
  'E-2: 個人大会 (comp_personal_a) の生 DELETE でも同様に SET NULL される ' ||
  '(RPC を経由しない場合はこの safety net が無いことに注意。PMへの注記事項)');

-- =============================================================================
-- F. 参考: anon による直接アクセス拒否 (既存パターンの踏襲、非退行)
-- =============================================================================
select public.qa_login_anon();

select throws_ok(
  $$ select * from public.goals $$,
  '42501', null,
  'F-1: anon は goals を SELECT できない (GRANT 剥奪)');

select throws_ok(
  $$ insert into public.goals (user_id, competition_id, style_id, target_time, status)
     values ('55555555-5555-4555-a555-000000000001', '77777777-7777-4777-a777-000000000004', 3, 55.00, 'active') $$,
  '42501', null,
  'F-2: anon は INSERT できない');

select throws_ok(
  $$ update public.goals set target_time = 1.00 $$,
  '42501', null,
  'F-3: anon は UPDATE できない');

select throws_ok(
  $$ delete from public.goals $$,
  '42501', null,
  'F-4: anon は DELETE できない');

select public.qa_logout();

-- 無関係確認: user_b の goal_b_private は本テストの一切の操作の影響を受けていない
select is(
  (select competition_id from public.goals where id = '88888888-8888-4888-a888-000000000004'),
  '77777777-7777-4777-a777-000000000004'::uuid,
  'G-1 [非退行]: 無関係な user_b の goal_b_private は本テストの全操作を通じて変更されていない');

select * from finish();
rollback;
