-- =============================================================================
-- pgTAP: competitions/practices の UPDATE RLS における team_id 書き換えバイパス
-- (Sprint Contract 追補 SC8 — PM 実測)
--
-- 背景:
--   "Users can update own competitions" / "Users can update own practices"
--   (20251201014342_initial_schema.sql:1793 / :1837) は USING のみで
--   WITH CHECK が無い。Postgres は WITH CHECK 省略時に USING 式を新行にも
--   適用するため、user_id が変わらない限り team_id を書き換える UPDATE が通る。
--
--   これにより、チーム大会/チーム練習を non-admin が
--     1. UPDATE ... SET team_id = NULL (自分が作成者なので USING を通過)
--     2. DELETE (team_id IS NULL の枝で削除できる)
--   の2段操作で、20260919000000 の DELETE ポリシー強化・
--   delete_competition_with_records の team_id ガード・
--   deletePractice の `.is("team_id", null)` を全てバイパスできる。
--
-- 対象 migration (未着手・本テストは Developer の D1b 実装前に書かれた):
--   competitions/practices の UPDATE ポリシーに WITH CHECK を追加するか、
--   BEFORE UPDATE トリガで team_id の書き換えを拒否する。
--   本テストは方式に依存せず「team_id が書き換わらないこと」のみを検証する。
--
-- 観点:
--   V-U-01: 非admin (作成者本人) がチーム大会の team_id を NULL に UPDATE しても
--           団体行の team_id は変わらない (2段バイパスの入口を塞ぐ)。
--   V-U-02: 非admin が他チームの team_id に書き換えても変わらない。
--   V-U-03: 同様のことを practices でも検証する (team_id → NULL)。
--   V-U-04: 同一 UPDATE 文で team_id 以外のフィールド (title/place) も
--           同時に書き換えようとした場合、防御が「文全体を拒否」であれば
--           他フィールドも変更されない (部分適用しない)。
--           ※ 実装がトリガで team_id 列だけ弾く方式なら他フィールドは
--             更新されうるため、この観点は「team_id が変わらないこと」
--             のみを厳密に assert し、他フィールドの成否は問わない。
--   V-U-05 (非退行): team_id に触れない UPDATE (title のみ変更) は
--           従来通り成功する (防御が正当な更新まで壊していないこと)。
--   V-U-06 (非退行): チーム管理者による team_id を含まない UPDATE
--           (is_team_admin 経由) も従来通り成功する。
--
-- 実行: ローカル Supabase 起動済み (supabase start + migration 適用済み) の
--       状態で `supabase test db` を実行する。全フィクスチャは rollback で消える。
--
-- 既知の制約: Developer が D1b (WITH CHECK 追加 or トリガ追加) を実装するまでは
--   V-U-01/02/03 は RED になる (これが「ガードを外すと赤くなる」ことの実証)。
--
-- 【追記 2026-09-19 Sprint Contract 2 (編集禁止) 着手時の QA 実測】
--   Contract 2 の D1 migration (20260919010000_team_edit_admin_only.sql) が
--   competitions/practices の UPDATE ポリシーを DELETE と対称形
--   ((team_id IS NULL AND user_id=auth.uid()) OR (team_id IS NOT NULL AND
--   is_team_admin(...))) に置換した。これにより非admin (作成者本人) は
--   team_id IS NOT NULL の行に対して**そもそも UPDATE の USING を通過できなくなり
--   (行が0件にフィルタされ)、トリガに到達する前に RLS だけで無言の0行成功として
--   弾かれる**ようになった (PostgREST/生SQLとも同様: RLS拒否のUPDATEはエラーを
--   出さず0行成功で返る)。
--
--   このため、以下の観点は Contract 1 時点の「トリガが例外を投げる」という
--   前提から「RLSが0行に絞り込み例外は発生しない」という前提に変わった:
--     - V-U-01/02/03/04: throws_ok → 0行/値不変の assert に変更 (実測により修正済み)
--     - V-U-05: 「非adminによるtitleのみのUPDATEは従来通り成功する」という
--       Contract 1 時代の非退行前提は Contract 2 の D1 により**意図的に上書き**
--       された (team_id を含まない一般UPDATEも今はadmin限定になったため)。
--       これはバグではなく Contract 2 の SC1 (個人画面からの編集禁止) が
--       意図した挙動そのものであり、古い非退行チェックを理由に Contract 2 の
--       実装を差し戻してはならない。期待値を反転させ、SC1 の一部として扱う。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

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
--   admin_u  : team1 の管理者
--   member_u : team1 の非管理者 (approved member)。チーム大会/練習の作成者。
--   team1/team2: team_id 書き換え先の判別用に2チーム用意する。
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('c1000000-0000-4000-a000-000000000001', 'qa-updbypass-admin@example.test'),
  ('c1000000-0000-4000-a000-000000000002', 'qa-updbypass-member@example.test');

insert into public.users (id, name)
select id, email from auth.users
where email like 'qa-updbypass-%@example.test'
on conflict (id) do nothing;

insert into public.teams (id, name, invite_code, created_by) values
  ('d1000000-0000-4000-a000-000000000001', 'QA UpdBypass Team1', 'QA-UPDBYP-T1',
   'c1000000-0000-4000-a000-000000000001'),
  ('d1000000-0000-4000-a000-000000000002', 'QA UpdBypass Team2', 'QA-UPDBYP-T2',
   'c1000000-0000-4000-a000-000000000001');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at) values
  ('d1000000-0000-4000-a000-000000000001', 'c1000000-0000-4000-a000-000000000001', 'admin', 'approved', true, '2026-01-01'),
  ('d1000000-0000-4000-a000-000000000001', 'c1000000-0000-4000-a000-000000000002', 'user',  'approved', true, '2026-01-01');

-- member_u 作成のチーム大会/チーム練習 (team1)。
-- 各シナリオ (V-U-01/02/03/04/05/06) は互いに独立した行を使う
-- (同一行を複数シナリオで使い回すと、前のシナリオの UPDATE 結果が後続に
--  混入し「どの防御が効いたか/効いていないか」を誤判定するため)。
insert into public.competitions (id, user_id, team_id, title, date) values
  ('e1000000-0000-4000-a000-000000000001', 'c1000000-0000-4000-a000-000000000002',
   'd1000000-0000-4000-a000-000000000001', 'QA対象チーム大会(V-U-01用)', '2026-08-01');

insert into public.practices (id, user_id, team_id, title, date) values
  ('e1000000-0000-4000-a000-000000000002', 'c1000000-0000-4000-a000-000000000002',
   'd1000000-0000-4000-a000-000000000001', 'QA対象チーム練習(V-U-03用)', '2026-08-01');

-- 非退行検証用: team_id に触れない UPDATE 対象 (member_u 作成の別チーム大会)
insert into public.competitions (id, user_id, team_id, title, date) values
  ('e1000000-0000-4000-a000-000000000003', 'c1000000-0000-4000-a000-000000000002',
   'd1000000-0000-4000-a000-000000000001', 'QA非退行用チーム大会(V-U-05用)', '2026-08-02');

-- V-U-02 (他チームIDへの書き換え) 専用行
insert into public.competitions (id, user_id, team_id, title, date) values
  ('e1000000-0000-4000-a000-000000000004', 'c1000000-0000-4000-a000-000000000002',
   'd1000000-0000-4000-a000-000000000001', 'QA対象チーム大会(V-U-02用)', '2026-08-03');

-- V-U-04 (複合UPDATE) 専用行
insert into public.competitions (id, user_id, team_id, title, date) values
  ('e1000000-0000-4000-a000-000000000005', 'c1000000-0000-4000-a000-000000000002',
   'd1000000-0000-4000-a000-000000000001', 'QA対象チーム大会(V-U-04用)', '2026-08-04');

-- V-U-06 (管理者による非退行UPDATE) 専用行。member_u 作成・admin_u が編集する対象
insert into public.competitions (id, user_id, team_id, title, date) values
  ('e1000000-0000-4000-a000-000000000006', 'c1000000-0000-4000-a000-000000000002',
   'd1000000-0000-4000-a000-000000000001', 'QA対象チーム大会(V-U-06用)', '2026-08-05');

-- =============================================================================
-- V-U-01: 非admin (作成者本人) がチーム大会の team_id を NULL に書き換えられない
-- =============================================================================
select public.qa_login_as('c1000000-0000-4000-a000-000000000002'); -- member_u (非admin, 作成者本人)

-- Contract 2 の D1 により、非adminはそもそも team_id IS NOT NULL の行に対する
-- UPDATE の USING を通過できない (行が0件にフィルタされる)。エラーは発生せず
-- 無言の0行成功になるため、throws_ok ではなく「値が変わらないこと」を assert する。
-- ただし RLS 側で弾かれず旧来のトリガ経由 (例外) で弾かれる実装のままでも
-- 検証できるよう、例外はここで飲み込み最終状態のみを見る (実装方式に依存しない)。
do $$ begin
  update public.competitions set team_id = null
   where id = 'e1000000-0000-4000-a000-000000000001';
exception when others then null;
end $$;

select public.qa_logout();

select is(
  (select team_id from public.competitions where id = 'e1000000-0000-4000-a000-000000000001'),
  'd1000000-0000-4000-a000-000000000001'::uuid,
  'V-U-01b: 拒否後も team_id は team1 のまま変わらない');

-- =============================================================================
-- V-U-02: 非admin が他チーム (team2) の team_id に書き換えられない
-- =============================================================================
select public.qa_login_as('c1000000-0000-4000-a000-000000000002'); -- member_u

do $$ begin
  update public.competitions set team_id = 'd1000000-0000-4000-a000-000000000002'
   where id = 'e1000000-0000-4000-a000-000000000004';
exception when others then null;
end $$;

select public.qa_logout();

select is(
  (select team_id from public.competitions where id = 'e1000000-0000-4000-a000-000000000004'),
  'd1000000-0000-4000-a000-000000000001'::uuid,
  'V-U-02b: 拒否後も team_id は team1 のまま変わらない');

-- =============================================================================
-- V-U-03: practices でも同様に team_id=NULL への書き換えができない
-- =============================================================================
select public.qa_login_as('c1000000-0000-4000-a000-000000000002'); -- member_u

do $$ begin
  update public.practices set team_id = null
   where id = 'e1000000-0000-4000-a000-000000000002';
exception when others then null;
end $$;

select public.qa_logout();

select is(
  (select team_id from public.practices where id = 'e1000000-0000-4000-a000-000000000002'),
  'd1000000-0000-4000-a000-000000000001'::uuid,
  'V-U-03b: 拒否後も team_id は変わらない');

-- =============================================================================
-- V-U-04: team_id と同時に他フィールドを書き換えようとしても team_id は変わらない
-- (他フィールドの成否は方式依存のため assert しない)
-- =============================================================================
select public.qa_login_as('c1000000-0000-4000-a000-000000000002'); -- member_u

do $$ begin
  update public.competitions set team_id = null, title = 'QA_HIJACKED_TITLE'
   where id = 'e1000000-0000-4000-a000-000000000005';
exception when others then null;
end $$;

select public.qa_logout();

select is(
  (select team_id from public.competitions where id = 'e1000000-0000-4000-a000-000000000005'),
  'd1000000-0000-4000-a000-000000000001'::uuid,
  'V-U-04b: 拒否後も team_id 列自体は書き換わらない');

select isnt(
  (select title from public.competitions where id = 'e1000000-0000-4000-a000-000000000005'),
  'QA_HIJACKED_TITLE',
  'V-U-04c: 例外により文全体がロールバックされ、title も便乗更新されていない');

-- =============================================================================
-- V-U-05 (Contract 2 により期待値反転): team_id に触れない UPDATE (title のみ) も、
-- Contract 2 の D1 (20260919010000) 以降は非adminには一律拒否される。
--
-- Contract 1 時点では「team_id を書き換えない一般UPDATEは作成者なら従来通り
-- 成功する」が非退行の前提だったが、Contract 2 の SC1 (個人画面からの編集禁止)
-- が意図的にこの前提を上書きした。バグではないため、期待値を反転させる。
-- =============================================================================
select public.qa_login_as('c1000000-0000-4000-a000-000000000002'); -- member_u (作成者本人・非admin)

do $$ begin
  update public.competitions
     set title = 'QA_CONTRACT2で拒否されるはずの更新'
   where id = 'e1000000-0000-4000-a000-000000000003';
exception when others then null;
end $$;

select public.qa_logout();

select isnt(
  (select title from public.competitions where id = 'e1000000-0000-4000-a000-000000000003'),
  'QA_CONTRACT2で拒否されるはずの更新',
  'V-U-05 (Contract2で仕様変更): 非adminによる team_id 不変の一般UPDATE (title) も'
    || ' Contract2 の D1 以降は拒否される (Contract1時代の非退行前提を意図的に上書き)');

select is(
  (select team_id from public.competitions where id = 'e1000000-0000-4000-a000-000000000003'),
  'd1000000-0000-4000-a000-000000000001'::uuid,
  'V-U-05b: title 更新後も team_id は元のまま (team1)');

-- =============================================================================
-- V-U-06 (非退行): チーム管理者による team_id を含まない UPDATE も従来通り成功する
-- =============================================================================
select public.qa_login_as('c1000000-0000-4000-a000-000000000001'); -- admin_u (team1 の管理者、作成者ではない)

update public.competitions
   set title = 'QA管理者による更新後'
 where id = 'e1000000-0000-4000-a000-000000000006';

select public.qa_logout();

select is(
  (select title from public.competitions where id = 'e1000000-0000-4000-a000-000000000006'),
  'QA管理者による更新後',
  'V-U-06: team_id を含まない管理者UPDATE (is_team_adminの枝) は従来通り成功する');

-- =============================================================================
-- 前提確認 (フィクスチャの健全性): member_u は実際に team1 の非admin approved member
-- (V-U-07 でチーム自体を削除するため、前提確認は先に済ませておく)
-- =============================================================================
select ok(
  not public.is_team_admin(
    'd1000000-0000-4000-a000-000000000001'::uuid,
    'c1000000-0000-4000-a000-000000000002'::uuid),
  '前提確認a: member_u は team1 の admin ではない (テストの前提が壊れていないこと)');

select ok(
  public.is_team_member(
    'd1000000-0000-4000-a000-000000000001'::uuid,
    'c1000000-0000-4000-a000-000000000002'::uuid),
  '前提確認b: member_u は team1 の approved member である');

select ok(
  public.is_team_admin(
    'd1000000-0000-4000-a000-000000000001'::uuid,
    'c1000000-0000-4000-a000-000000000001'::uuid),
  '前提確認c: admin_u は team1 の admin である');

-- =============================================================================
-- SC3 (PM裁定): チーム管理者はチームタブから引き続きチーム大会/練習を削除できる。
-- 本スプリントの DELETE RLS 置換
--   (team_id IS NULL AND user_id = auth.uid())
--   OR (team_id IS NOT NULL AND is_team_admin(team_id, auth.uid()))
-- が admin の DELETE を通すか、非admin/無関係ユーザーの DELETE を確実に塞ぐかを検証する。
--
-- 注意: PostgREST/SQL とも RLS 拒否の DELETE は「0行削除で成功」を返す。エラーは出ない。
-- 「エラーが出なかったから成功」と解釈してはならないため、必ず
--   (1) 影響行数 (削除で消えた行数、または削除試行後に行が実在するか)
-- の両方を厳密一致で assert する。
--
-- この pgTAP は DB 層の認可のみを検証する。「チームタブの UI が実際に admin へ
-- 削除ボタンを出すか」は TeamCompetitions.tsx/TeamPractices.tsx が他セッション WIP
-- ロック対象のため検証できておらず、本テストの範囲外である (QA報告で明記する)。
--
-- SC3 専用の行 (他ブロックと共有しない): team1 の団体大会/練習を新規に用意する。
-- =============================================================================
insert into auth.users (id, email) values
  ('c1000000-0000-4000-a000-000000000003', 'qa-updbypass-outsider@example.test');
insert into public.users (id, name)
select id, email from auth.users where email = 'qa-updbypass-outsider@example.test'
on conflict (id) do nothing;
-- outsider_u は team1 に一切所属しない無関係な第三者 (team_memberships行なし)

-- SC3-c/d 用 (非破壊アサーション): 削除を試みても行は残り続ける前提で使う
insert into public.competitions (id, user_id, team_id, title, date) values
  ('e1000000-0000-4000-a000-000000000008', 'c1000000-0000-4000-a000-000000000002',
   'd1000000-0000-4000-a000-000000000001', 'QA SC3非admin拒否用チーム大会', '2026-08-07');
insert into public.practices (id, user_id, team_id, title, date) values
  ('e1000000-0000-4000-a000-000000000009', 'c1000000-0000-4000-a000-000000000002',
   'd1000000-0000-4000-a000-000000000001', 'QA SC3非admin拒否用チーム練習', '2026-08-07');

-- SC3-c: 作成者だが非admin (member_u) による DELETE は0行 (本スプリントで塞いだ穴そのもの)
select public.qa_login_as('c1000000-0000-4000-a000-000000000002'); -- member_u (非admin, 作成者本人)

delete from public.competitions where id = 'e1000000-0000-4000-a000-000000000008';
delete from public.practices where id = 'e1000000-0000-4000-a000-000000000009';

select public.qa_logout();

select is(
  (select count(*)::int from public.competitions where id = 'e1000000-0000-4000-a000-000000000008'),
  1,
  'SC3-c (competitions): 作成者だが非adminの DELETE は0行拒否され、行は実在し続ける'
    || ' (旧ポリシーへの回帰再発防止の核心)');

select is(
  (select count(*)::int from public.practices where id = 'e1000000-0000-4000-a000-000000000009'),
  1,
  'SC3-c (practices): 作成者だが非adminの DELETE は0行拒否され、行は実在し続ける');

-- SC3-d: チームに無関係な第三者による DELETE も0行
select public.qa_login_as('c1000000-0000-4000-a000-000000000003'); -- outsider_u (team1に非所属)

delete from public.competitions where id = 'e1000000-0000-4000-a000-000000000008';
delete from public.practices where id = 'e1000000-0000-4000-a000-000000000009';

select public.qa_logout();

select is(
  (select count(*)::int from public.competitions where id = 'e1000000-0000-4000-a000-000000000008'),
  1,
  'SC3-d (competitions): チームに無関係な第三者の DELETE も0行拒否され、行は実在し続ける');

select is(
  (select count(*)::int from public.practices where id = 'e1000000-0000-4000-a000-000000000009'),
  1,
  'SC3-d (practices): チームに無関係な第三者の DELETE も0行拒否され、行は実在し続ける');

-- SC3-a/b 用 (破壊的アサーション): admin による削除は成功して行が消える。
-- SC3-c/d のフィクスチャと分離した専用行を使う (削除が成功すると行が消えるため)。
insert into public.competitions (id, user_id, team_id, title, date) values
  ('e1000000-0000-4000-a000-000000000010', 'c1000000-0000-4000-a000-000000000002',
   'd1000000-0000-4000-a000-000000000001', 'QA SC3admin成功用チーム大会', '2026-08-08');
insert into public.practices (id, user_id, team_id, title, date) values
  ('e1000000-0000-4000-a000-000000000011', 'c1000000-0000-4000-a000-000000000002',
   'd1000000-0000-4000-a000-000000000001', 'QA SC3admin成功用チーム練習', '2026-08-08');

select public.qa_login_as('c1000000-0000-4000-a000-000000000001'); -- admin_u (team1 admin, 作成者ではない)

delete from public.competitions where id = 'e1000000-0000-4000-a000-000000000010';

select public.qa_logout();

select is(
  (select count(*)::int from public.competitions where id = 'e1000000-0000-4000-a000-000000000010'),
  0,
  'SC3-a: team admin による DELETE FROM competitions は1行削除して成功する (非退行)');

select public.qa_login_as('c1000000-0000-4000-a000-000000000001'); -- admin_u

delete from public.practices where id = 'e1000000-0000-4000-a000-000000000011';

select public.qa_logout();

select is(
  (select count(*)::int from public.practices where id = 'e1000000-0000-4000-a000-000000000011'),
  0,
  'SC3-b: team admin による DELETE FROM practices は1行削除して成功する (非退行)');

-- =============================================================================
-- F2 (Web Developer修正・PM裁定 撤回後の最終仕様):
--   entries/records.team_id は competitions/practices.team_id とは独立した列で
--   あり、付け替えに追随しない。records の RLS は records.team_id を直接参照する
--   ため、非NULLへの付け替えを許すと「付け替え先チームから見て記録が0件に見える」
--   というデータ不整合が生じる。非NULL付け替えを必要とする正当なアプリ経路も
--   無いため、**NEW.team_id が非NULLになる変更は admin であっても一律拒否**する。
--   (当初 PM は「移動元・移動先の両方 admin なら許容」としたが、上記理由で撤回済み)
--
--   許可されるのは NEW.team_id IS NULL (チーム解除、delete_team_preserving_records
--   の救済経路) のみで、これは OLD.team_id の admin であることを要求する。
-- =============================================================================
insert into public.competitions (id, user_id, team_id, title, date) values
  ('e1000000-0000-4000-a000-000000000012', 'c1000000-0000-4000-a000-000000000001',
   'd1000000-0000-4000-a000-000000000001', 'QA F2 他チームへの付け替え拒否用チーム大会', '2026-08-09');

-- admin_u を team2 の admin にも追加する (「両方 admin でも拒否される」ことを示すため、
-- あえて両方の admin 資格を持つ状態を作ってから検証する)
insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at) values
  ('d1000000-0000-4000-a000-000000000002', 'c1000000-0000-4000-a000-000000000001', 'admin', 'approved', true, '2026-01-01');

-- V-U-08: admin_u は移動元(team1)・移動先(team2)の**両方** admin だが、
-- 非NULLへの付け替えは一律拒否される (entries/records.team_id 不整合防止のため)。
select public.qa_login_as('c1000000-0000-4000-a000-000000000001'); -- admin_u (team1/team2 両方 admin)

select throws_ok(
  $$ update public.competitions set team_id = 'd1000000-0000-4000-a000-000000000002'
     where id = 'e1000000-0000-4000-a000-000000000012' $$,
  null::char(5), null::text,
  'V-U-08a: 移動元・移動先の両方 admin であっても、非NULLへの team_id 付け替えは例外で拒否される'
    || ' (entries/records.team_id が追随しないデータ不整合を防ぐため、PM裁定撤回後の最終仕様)');

select public.qa_logout();

select is(
  (select team_id from public.competitions where id = 'e1000000-0000-4000-a000-000000000012'),
  'd1000000-0000-4000-a000-000000000001'::uuid,
  'V-U-08b: 拒否後も team_id は移動元(team1)のまま変わらない');

-- V-U-09 (新規): OLD.team_id IS NULL の個人大会/練習に team_id を後付けする
-- UPDATE も同様に拒否される (「個人→チーム変換」経路が無いことは grep で実測済み。
-- 万一 UI 側にこの経路ができても DB 層で必ず弾かれることを保証する)。
insert into public.competitions (id, user_id, team_id, title, date) values
  ('e1000000-0000-4000-a000-000000000013', 'c1000000-0000-4000-a000-000000000001', null,
   'QA F2 個人大会からチーム変換拒否用', '2026-08-10');
insert into public.practices (id, user_id, team_id, title, date) values
  ('e1000000-0000-4000-a000-000000000014', 'c1000000-0000-4000-a000-000000000001', null,
   'QA F2 個人練習からチーム変換拒否用', '2026-08-10');

select public.qa_login_as('c1000000-0000-4000-a000-000000000001'); -- admin_u (team1 admin だが対象行の所有者でもある)

select throws_ok(
  $$ update public.competitions set team_id = 'd1000000-0000-4000-a000-000000000001'
     where id = 'e1000000-0000-4000-a000-000000000013' $$,
  null::char(5), null::text,
  'V-U-09a: OLD.team_id IS NULL の個人大会に team_id を設定するUPDATEは例外で拒否される'
    || ' (個人→チーム変換経路が存在しないことの担保・作成者=team admin でも拒否)');

select throws_ok(
  $$ update public.practices set team_id = 'd1000000-0000-4000-a000-000000000001'
     where id = 'e1000000-0000-4000-a000-000000000014' $$,
  null::char(5), null::text,
  'V-U-09b: OLD.team_id IS NULL の個人練習に team_id を設定するUPDATEも例外で拒否される');

select public.qa_logout();

select is(
  (select team_id from public.competitions where id = 'e1000000-0000-4000-a000-000000000013'),
  null::uuid,
  'V-U-09c: 拒否後も個人大会の team_id は NULL のまま変わらない');

select is(
  (select team_id from public.practices where id = 'e1000000-0000-4000-a000-000000000014'),
  null::uuid,
  'V-U-09d: 拒否後も個人練習の team_id は NULL のまま変わらない');

-- =============================================================================
-- V-U-07 (非退行・最重要): delete_team_preserving_records RPC は本トリガ導入後も
-- end-to-end で成功する。
--
-- 懸念 (PM指摘): 本トリガは「UPDATE 時点で OLD.team_id に対して admin であること」を
-- 要求する。delete_team_preserving_records は
--   1. is_team_admin(p_team_id, caller) で認可チェック
--   2. UPDATE practices SET team_id = NULL WHERE team_id = p_team_id  (トリガ発火)
--   3. DELETE FROM teams (team_memberships も CASCADE で消える)
-- の順で実行するため、2. の時点ではまだ team_memberships が残っており
-- is_team_admin(OLD.team_id, caller) は true のままである。順序が逆
-- (先に membership を無効化してから practices を更新する実装) だと、この
-- トリガがチーム削除機能自体を壊す。RPC 全体を実行し、モックではなく実際に
-- practices.team_id が NULL化されチームが削除されることを確認する。
-- team1 をこのブロックで削除するため、他アサーションへの影響を避けて最後に置く。
-- =============================================================================
insert into public.practices (id, user_id, team_id, title, date) values
  ('e1000000-0000-4000-a000-000000000007', 'c1000000-0000-4000-a000-000000000001',
   'd1000000-0000-4000-a000-000000000001', 'QA E2E チーム削除対象練習', '2026-08-06');

select public.qa_login_as('c1000000-0000-4000-a000-000000000001'); -- admin_u (team1 admin)

select ok(
  (public.delete_team_preserving_records('d1000000-0000-4000-a000-000000000001'::uuid)->>'success')::boolean,
  'V-U-07a: delete_team_preserving_records は新トリガ導入後も success:true を返す'
    || ' (トリガがチーム削除を壊していないことの実測)');

select public.qa_logout();

select is(
  (select team_id from public.practices where id = 'e1000000-0000-4000-a000-000000000007'),
  null::uuid,
  'V-U-07b: チーム削除に伴い practices.team_id が NULL 化され個人練習として残る');

select is(
  (select count(*)::int from public.teams where id = 'd1000000-0000-4000-a000-000000000001'),
  0,
  'V-U-07c: チーム自体は削除されている');

select * from finish();
rollback;
