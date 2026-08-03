-- =============================================================================
-- pgTAP: セキュリティ監査 Critical 5件 (C-1/C-4/C-6) の実DB検証
--
-- 対象 migration (未実装・これから追加される想定):
--   - migration A (C-1 + C-6): increment_daily_usage の auth.uid() 検証化 +
--     search_path 固定 + anon EXECUTE 剥奪、app_daily_usage の
--     daily_usage_insert/daily_usage_update ポリシー DROP
--   - migration B (C-4): competitions/practices の INSERT ポリシーを
--     entries の正解パターン (initial_schema.sql:1706-1717) と同型に置換
--
-- 方針:
--   - Supabase クライアントをモックせず、role / JWT クレームの切替で実際の
--     RLS / GRANT / RPC を評価する（01_team_memberships_rls.test.sql と同じ型）。
--   - 攻撃 SQL は「PostgREST 経由の生 UPDATE/INSERT」および「RPC 直接呼び出し」を模す。
--   - このファイルは実装前に書いている。migration A/B が未適用のため、
--     C-1 の一部・C-4・C-6 は現時点で FAIL して当然（QA Phase A の想定通り）。
--
-- 実行: ローカル Supabase 起動済み (supabase start) の状態で `supabase test db`。
--       全フィクスチャは rollback で消える。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

-- -----------------------------------------------------------------------------
-- ヘルパー: JWT クレーム + ロール切替（既存テストと同一定義。rollback で消える）
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
--   attacker: 自分の app_daily_usage 行を持つ一般ユーザー
--   victim  : attacker とは無関係の一般ユーザー (C-6 の他人 p_user_id 攻撃対象)
--   team1(admin_a, member_b) / team2(admin_x) — team1 に所属しない outsider_d
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('77777777-7777-4777-a777-000000000001', 'qa-usage-attacker@example.test'),
  ('77777777-7777-4777-a777-000000000002', 'qa-usage-victim@example.test'),
  ('77777777-7777-4777-a777-000000000003', 'qa-team-admin-a@example.test'),
  ('77777777-7777-4777-a777-000000000004', 'qa-team-member-b@example.test'),
  ('77777777-7777-4777-a777-000000000005', 'qa-team-outsider-d@example.test');

insert into public.users (id, name)
select id, email from auth.users
where id in (
  '77777777-7777-4777-a777-000000000001',
  '77777777-7777-4777-a777-000000000002',
  '77777777-7777-4777-a777-000000000003',
  '77777777-7777-4777-a777-000000000004',
  '77777777-7777-4777-a777-000000000005')
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('88888888-8888-4888-a888-000000000001', 'QA Usage Team1', 'QA-USAGE-T1-CODE', '77777777-7777-4777-a777-000000000003');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at, left_at) values
  ('88888888-8888-4888-a888-000000000001', '77777777-7777-4777-a777-000000000003', 'admin', 'approved', true, '2026-01-01', null),
  ('88888888-8888-4888-a888-000000000001', '77777777-7777-4777-a777-000000000004', 'user',  'approved', true, '2026-02-01', null);

insert into public.app_daily_usage (user_id, app, usage_date, usage_count, daily_tokens_used, last_used_at) values
  ('77777777-7777-4777-a777-000000000001', 'swimhub_scanner', current_date, 3, 3, now());

-- =============================================================================
-- A. C-1: app_daily_usage への直接 UPDATE (トークンリセット攻撃) は拒否される
--    daily_usage_insert / daily_usage_update ポリシー DROP 後を想定。
--    daily_usage_select は変更しないため SELECT 自体は許可されたまま。
-- =============================================================================
select public.qa_login_as('77777777-7777-4777-a777-000000000001'); -- attacker (自分の行)

select throws_ok(
  $$ update public.app_daily_usage
     set daily_tokens_used = 0, usage_count = 0
     where user_id = auth.uid() and app = 'swimhub_scanner' $$,
  '42501', null,
  'A-1: 自分の app_daily_usage 行であっても直接 UPDATE (daily_tokens_used=0 リセット) は拒否される (daily_usage_update ポリシー DROP 済み想定)');

select throws_ok(
  $$ insert into public.app_daily_usage (user_id, app, usage_date, usage_count, daily_tokens_used)
     values (auth.uid(), 'swimhub_timer', current_date, 0, 0) $$,
  '42501', null,
  'A-2: app_daily_usage への直接 INSERT (別アプリの新規行を自作) も拒否される (daily_usage_insert ポリシー DROP 済み想定)');

select public.qa_logout();

select results_eq(
  $$ select usage_count, daily_tokens_used
     from public.app_daily_usage
     where user_id = '77777777-7777-4777-a777-000000000001' and app = 'swimhub_scanner' $$,
  $$ values (3, 3) $$,
  'A-3: 攻撃後も既存行の usage_count/daily_tokens_used は 3 のまま変更されていない');

-- =============================================================================
-- B. C-1 正規経路: increment_daily_usage RPC 経由なら usage_count/daily_tokens_used が +1
-- =============================================================================
select public.qa_login_as('77777777-7777-4777-a777-000000000001'); -- attacker = 正規ユーザーとして

select lives_ok(
  $$ select public.increment_daily_usage(auth.uid(), 'swimhub_scanner'::app_id, current_date, now()) $$,
  'B-1: RPC 経由の自分自身への increment は成功する (正規経路の回帰)');

select public.qa_logout();

select results_eq(
  $$ select usage_count, daily_tokens_used
     from public.app_daily_usage
     where user_id = '77777777-7777-4777-a777-000000000001' and app = 'swimhub_scanner' $$,
  $$ values (4, 4) $$,
  'B-2: RPC 経由の increment 後は usage_count/daily_tokens_used がともに 3→4 (+1) になっている');

-- =============================================================================
-- C. C-6: increment_daily_usage への anon EXECUTE は GRANT 層で拒否される
-- =============================================================================
select ok(
  not has_function_privilege(
    'anon',
    'public.increment_daily_usage(uuid, app_id, date, timestamptz)',
    'EXECUTE'),
  'C-1: anon ロールは increment_daily_usage を EXECUTE できない (REVOKE ALL FROM PUBLIC,anon 済み想定)');

select public.qa_login_anon();

select throws_ok(
  $$ select public.increment_daily_usage(
       '77777777-7777-4777-a777-000000000001'::uuid, 'swimhub_scanner'::app_id, current_date, now()) $$,
  '42501', null,
  'C-2: anon ロールが increment_daily_usage を直接呼んでも GRANT 層で拒否される');

select public.qa_logout();

-- =============================================================================
-- D. C-1/C-6: authenticated が他人の p_user_id を渡すと例外になる (auth.uid() 検証)
--    NOTE: この自己チェックは authenticated 経路 (anon key + user JWT) 専用の設計。
--    呼び出し元2箇所 (edge function scan-timesheet, scanner incrementScanCount) は
--    いずれも service_role ではなく anon+ユーザーJWT クライアントであることを実測済み
--    (QA Phase A 報告参照)。service_role 経由の呼び出しがないため、この検証は退行を生まない。
-- =============================================================================
select public.qa_login_as('77777777-7777-4777-a777-000000000001'); -- attacker

select throws_ok(
  $$ select public.increment_daily_usage(
       '77777777-7777-4777-a777-000000000002'::uuid, 'swimhub_scanner'::app_id, current_date, now()) $$,
  null, null,
  'D-1: authenticated ユーザーが他人 (victim) の p_user_id を渡すと例外になる (auth.uid()検証)');

select public.qa_logout();

select is(
  (select count(*)::int from public.app_daily_usage
   where user_id = '77777777-7777-4777-a777-000000000002'),
  0,
  'D-2: 他人へのなりすまし increment 攻撃後も victim の行は 1 件も作られていない');

-- =============================================================================
-- E. C-4: 非メンバーによる他チーム team_id での competitions/practices INSERT は拒否される
--    正解パターン (entries): is_team_admin OR (user_id=self AND (team_id IS NULL OR is_team_member))
-- =============================================================================
select public.qa_login_as('77777777-7777-4777-a777-000000000005'); -- outsider_d (team1 非所属)

select throws_ok(
  $$ insert into public.competitions (user_id, team_id, title, date)
     values (auth.uid(), '88888888-8888-4888-a888-000000000001', 'QA不正大会', current_date + 30) $$,
  '42501', null,
  'E-1: 非メンバーが他チームの team_id で competitions を INSERT すると拒否される');

select throws_ok(
  $$ insert into public.practices (user_id, team_id, date)
     values (auth.uid(), '88888888-8888-4888-a888-000000000001', current_date + 30) $$,
  '42501', null,
  'E-2: 非メンバーが他チームの team_id で practices を INSERT すると拒否される');

select public.qa_logout();

select is(
  (select count(*)::int from public.competitions
   where team_id = '88888888-8888-4888-a888-000000000001'
     and user_id = '77777777-7777-4777-a777-000000000005'),
  0,
  'E-3: 攻撃後も outsider の competitions 行は作られていない');

select is(
  (select count(*)::int from public.team_attendance ta
   join public.competitions c on c.id = ta.competition_id
   where c.team_id = '88888888-8888-4888-a888-000000000001'
     and c.user_id = '77777777-7777-4777-a777-000000000005'),
  0,
  'E-4: team_attendance も 1 行も増えていない (トリガー未発火)');

-- =============================================================================
-- F. C-4 回帰: 正規のチーム管理者による作成は成功し team_attendance が生成される
--
-- NOTE: あえて admin_a (team1 管理者) を使う。team_attendance の
-- "Users can manage own attendance" ポリシー (INSERT WITH CHECK:
-- user_id=self OR is_team_admin(team_id, self)) は、create_attendance_for_team_*
-- トリガーが「他メンバー全員分」の行を一括 INSERT する際、実行者が
-- team_admin でなければ他メンバー分の行で必ず WITH CHECK に落ちる
-- (実測済み: member_b で試したところ 42501 で INSERT 自体が全体ロールバックされた)。
-- これは C-4 とは独立した既存の設計 (team 管理者のみが team 全体の
-- 出欠を代理生成できる) であり、本スプリントの対象外。よってここでの
-- 回帰確認は admin_a を主体にする。
-- =============================================================================
select public.qa_login_as('77777777-7777-4777-a777-000000000003'); -- admin_a (team1 管理者)

select lives_ok(
  $$ insert into public.competitions (user_id, team_id, title, date)
     values (auth.uid(), '88888888-8888-4888-a888-000000000001', 'QA正規大会', current_date + 30) $$,
  'F-1: team1 の管理者は自チームの team_id で competitions を作成できる (回帰)');

select lives_ok(
  $$ insert into public.practices (user_id, team_id, date)
     values (auth.uid(), '88888888-8888-4888-a888-000000000001', current_date + 31) $$,
  'F-2: team1 の管理者は自チームの team_id で practices を作成できる (回帰)');

select public.qa_logout();

select ok(
  (select count(*)::int from public.team_attendance ta
   join public.competitions c on c.id = ta.competition_id
   where c.team_id = '88888888-8888-4888-a888-000000000001'
     and c.title = 'QA正規大会') > 0,
  'F-3: 正規作成された competitions には team_attendance が生成されている (回帰: 全メンバー分の出欠行)');

select ok(
  (select count(*)::int from public.team_attendance ta
   join public.practices p on p.id = ta.practice_id
   where p.team_id = '88888888-8888-4888-a888-000000000001'
     and p.date = current_date + 31) > 0,
  'F-4: 正規作成された practices にも team_attendance が生成されている (回帰)');

-- =============================================================================
-- H. C-4 第2 OR 枝の直接検証 (Reviewer 指摘)
--
-- ポリシーは `is_team_admin(...) OR (user_id=self AND (team_id IS NULL OR
-- is_team_member(...)))` の2枝構成。E (outsider 拒否) と F (admin 許可=第1枝)
-- だけでは「一般メンバー (role='user') が自チームの practices/competitions を
-- 作成する」= 第2枝が一度も評価されておらず、第2枝の引数順・括弧が壊れていても
-- スイートは緑になってしまう。
--
-- H-1/H-2: team_attendance 側の別ポリシー (user_id=self OR is_team_admin) は
--   一般メンバーによる「他メンバー全員分」の一括出欠 INSERT を admin でない
--   という理由だけで拒否する、C-4 とは独立した既存の制約 (F ブロックの NOTE
--   参照)。これが第2枝の検証を覆い隠さないよう、この区間だけ
--   create_attendance_on_team_* トリガーを一時的に無効化し、
--   competitions/practices の INSERT ポリシーそのものを直接検証する。
--   (ファイル全体が最後に rollback されるため、本番スキーマへの影響は無い)
-- H-3: 第2枝で作成された行が実在することの確認。
-- H-4/H-5: トリガーを元に戻した「現実の」経路では一般メンバーの team-scoped
--   作成が team_attendance 側の制約で失敗すること、および migration B の
--   旧ポリシー (team_id 未検証) に一時的に差し替えても同じ失敗が再現される
--   ことを比較し、この失敗が C-4 の修正由来ではないことを立証する。
-- =============================================================================

-- H-1/H-2: トリガーを一時的に無効化し、ポリシー (第2枝) 自体を検証する
select public.qa_logout(); -- トリガー操作は所有者権限 (postgres) が必要

alter table public.competitions disable trigger create_attendance_on_team_competition;
alter table public.practices disable trigger create_attendance_on_team_practice;

select public.qa_login_as('77777777-7777-4777-a777-000000000004'); -- member_b (team1 の一般メンバー、非admin)

select lives_ok(
  $$ insert into public.competitions (user_id, team_id, title, date)
     values (auth.uid(), '88888888-8888-4888-a888-000000000001', 'QA一般メンバー大会', current_date + 32) $$,
  'H-1: [第2枝] team1 の一般メンバー (非admin) は自チームの team_id で competitions を作成できる (team_attendance トリガーを一時無効化し、ポリシー自体を直接検証)');

select lives_ok(
  $$ insert into public.practices (user_id, team_id, date)
     values (auth.uid(), '88888888-8888-4888-a888-000000000001', current_date + 33) $$,
  'H-2: [第2枝] team1 の一般メンバー (非admin) は自チームの team_id で practices を作成できる (同上)');

select public.qa_logout();

alter table public.competitions enable trigger create_attendance_on_team_competition;
alter table public.practices enable trigger create_attendance_on_team_practice;

select is(
  (select count(*)::int from public.competitions
   where team_id = '88888888-8888-4888-a888-000000000001'
     and user_id = '77777777-7777-4777-a777-000000000004'
     and title = 'QA一般メンバー大会'),
  1,
  'H-3: 第2枝で作成された competitions 行が実際に1件存在する (トリガー無効化中でも INSERT 自体は本物)');

-- H-4: トリガー有効時 (現実の経路) では、一般メンバーの team-scoped 作成は
-- team_attendance 側の別ポリシーで失敗する (C-4 の対象範囲外の既存挙動)
select public.qa_login_as('77777777-7777-4777-a777-000000000004'); -- member_b

select throws_ok(
  $$ insert into public.competitions (user_id, team_id, title, date)
     values (auth.uid(), '88888888-8888-4888-a888-000000000001', 'QA一般メンバー大会2', current_date + 34) $$,
  '42501', null,
  'H-4: [トリガー有効時] 一般メンバーの team-scoped competitions 作成は team_attendance 側の制約で失敗する (現実の経路。C-4 の対象範囲外の既存挙動)');

select public.qa_logout();

-- H-5: migration B 適用前の旧ポリシー (team_id 未検証) に一時的に差し替えて
-- 同じ操作を再現し、H-4 の失敗が migration B (C-4 修正) 由来ではなく
-- 適用前から同一の挙動であることを示す。
DROP POLICY "Users can create own competitions" ON public.competitions;
CREATE POLICY "Users can create own competitions" ON public.competitions
  FOR INSERT WITH CHECK (("user_id" = (SELECT auth.uid())));

select public.qa_login_as('77777777-7777-4777-a777-000000000004'); -- member_b

select throws_ok(
  $$ insert into public.competitions (user_id, team_id, title, date)
     values (auth.uid(), '88888888-8888-4888-a888-000000000001', 'QA一般メンバー大会3', current_date + 35) $$,
  '42501', null,
  'H-5: [migration B 適用前の旧ポリシーでも] 同じ一般メンバー操作は同じく team_attendance 制約で失敗する (= H-4 の失敗は C-4 修正が原因ではなく、migration B 適用前から同一)');

select public.qa_logout();

-- 旧ポリシーを migration B の正規ポリシーに戻す (以降のテストへの影響を防ぐ)
DROP POLICY "Users can create own competitions" ON public.competitions;
CREATE POLICY "Users can create own competitions" ON public.competitions FOR INSERT WITH CHECK (
  public.is_team_admin("competitions"."team_id", (SELECT "auth"."uid"()))
  OR
  (
    ("user_id" = (SELECT "auth"."uid"()))
    AND
    (
      ("team_id" IS NULL)
      OR
      public.is_team_member("competitions"."team_id", (SELECT "auth"."uid"()))
    )
  )
);

-- =============================================================================
-- G. C-4 回帰: team_id IS NULL の個人利用が壊れていないこと
--    entries と同型のポリシーに置換した際、"team_id IS NULL" 分岐を
--    落としていないかを個別に確認する (team 経路のテストだけでは検出できない)。
-- =============================================================================
select public.qa_login_as('77777777-7777-4777-a777-000000000005'); -- outsider_d (どのteamにも非所属)

select lives_ok(
  $$ insert into public.competitions (user_id, team_id, title, date)
     values (auth.uid(), null, 'QA個人大会', current_date + 1) $$,
  'G-1: team_id IS NULL の個人大会作成はチーム非所属ユーザーでも成功する (回帰)');

select lives_ok(
  $$ insert into public.practices (user_id, team_id, date)
     values (auth.uid(), null, current_date + 1) $$,
  'G-2: team_id IS NULL の個人練習作成はチーム非所属ユーザーでも成功する (回帰)');

select public.qa_logout();

select * from finish();
rollback;
