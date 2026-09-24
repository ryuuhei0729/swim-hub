-- =============================================================================
-- pgTAP: リレー記録の FK 削除挙動と leg の認可 (Reviewer Critical C-1 / C-2)
--
-- 対象 migration: 20260908000000_add_relay_records.sql
--                 20260908000100_team_relay_rankings_rpc.sql
--
-- ⚠️ ファイル分割の理由:
--   同スプリントの `12_team_relay_rankings_rpc.test.sql` は別セッションが
--   編集中 (mtime 11:xx) なので、書き込みレースを避けて別ファイルにしている。
--   (過去に並列 Evaluator のテストファイルレースで偽 Critical が出た前例あり)
--
-- 🚨 これは **jsdom / vitest では原理的に検出できない** 2件である。
--    FK の ON DELETE と RLS ポリシーは Postgres だけが評価するので、
--    実 DB 上で「行を消す」「別ロールで INSERT する」しか確かめる方法が無い。
--
-- 観点:
--   V-C1-01: relay_records.created_by の FK は ON DELETE **SET NULL** であること。
--            現在は CASCADE で、スキーマ内の created_by 6本のうちこれだけが
--            CASCADE (他5本は SET NULL)。
--   V-C1-02 (中核): 入力した管理者を削除しても **リレー記録の行が残る**。
--            バックフィル (scripts/backfill-relay-records.ts) は
--            「そのチームの最古の承認済み管理者」を全行の created_by に入れるため、
--            その1人の退会でバックフィルした全行が消える = 被害が増幅される。
--            そこで fixture も「3行すべて同一の created_by」にして増幅を再現する。
--   V-C1-03: 泳者 (relay_record_legs.user_id) の削除ではレグ行が残り user_id が
--            NULL になる (既に SET NULL。非退行の確認)。
--   V-C1-04: team_id は CASCADE のまま (チームを消せばリレー記録も消える)。
--            「created_by を直すついでに全部 SET NULL にした」誤修正を弾く。
--
--   V-C2-01 (中核): チーム管理者が **チーム非メンバーの user_id** でレグを
--            INSERT しようとすると RLS で弾かれる。現在の INSERT ポリシーは
--            「呼び出し元が当該チームの承認済みアクティブ管理者か」しか見ておらず、
--            `relay_record_legs.user_id` をチームに拘束していない。
--            通ると SECURITY DEFINER の RPC が
--            `LEFT JOIN public.users u ON u.id = l.user_id` 経由で
--            その人の **本名 (u.name) とアバターパス (u.profile_image_path)** を返す。
--            素の users SELECT は RLS で0行なのに RPC では見える = 情報露出。
--            (第1弾の get_team_record_rankings は
--             `JOIN team_member m ON m.user_id = r.user_id` で母集団を縛っていた。
--             こちらはその防御が1枚落ちている)
--   V-C2-02: 承認済みアクティブメンバーの user_id なら INSERT できる (非退行)。
--   V-C2-03: 退会済み (approved かつ is_active=false) メンバーの user_id も
--            INSERT できる。RPC が「退会したメンバーの名前も読める」ことを
--            意図している (20260908000100 の冒頭コメント + legs の
--            user_id が ON DELETE SET NULL) ため、述語は
--            「team_memberships に行が存在するか」であって
--            「approved かつ is_active」ではない。
--            ⚠️ ここを approved+active で縛ると、退会者を含む過去のリレーを
--               編集保存できなくなる (レグ1本が入らずリレーが3レグに欠ける)。
--   V-C2-04: user_id が NULL のレグは INSERT できる (泳者不明のレグ。
--            列自体が NULL 許容で、退会時の SET NULL の着地点でもある)。
--
-- 現状: V-C1-01/02 と V-C2-01 は **赤で正しい** (未修正のバグの実証)。
--       修正後に緑になる形で書いている。期待値の側を緩めないこと。
--
-- 実行: ローカル Supabase 起動済み + migration 適用済みで `supabase test db`。
--       全フィクスチャは rollback で消える。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- -----------------------------------------------------------------------------
-- ヘルパー: JWT クレーム + ロール切替 (01/04/10/11 の各テストと同型)
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

-- =============================================================================
-- V-C1-01: FK のメタデータ (confdeltype)
--   'a'=NO ACTION / 'r'=RESTRICT / 'c'=CASCADE / 'n'=SET NULL / 'd'=SET DEFAULT
-- =============================================================================
select is(
  (select c.confdeltype
   from pg_constraint c
   where c.conname = 'relay_records_created_by_fkey'
     and c.conrelid = 'public.relay_records'::regclass),
  'n'::"char",
  'V-C1-01: relay_records.created_by は ON DELETE SET NULL (CASCADE だと入力者の退会でリレー記録が全消滅する)');

-- 同じ列名の他の FK が SET NULL であることを対照として示す
-- (created_by 6本のうち relay_records だけが CASCADE だった、という Reviewer の実測の裏付け)
select is(
  (select count(*)::int
   from pg_constraint c
     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f'
     and a.attname = 'created_by'
     and c.confdeltype = 'c'),
  0,
  'V-C1-01b: created_by を参照する FK に ON DELETE CASCADE のものが1本も無い');

-- =============================================================================
-- フィクスチャ
--   u_admin   : team_alpha の承認済みアクティブ管理者。全リレー記録の created_by
--               (バックフィルが「最古の承認済み管理者」を全行に入れる状況の再現)
--   u_swimmer1: 承認済みアクティブメンバー (泳者)
--   u_swimmer2: 承認済みアクティブメンバー (泳者)
--   u_left    : approved だが is_active=false (退会済み。過去のリレーに残る泳者)
--   u_outsider: team_alpha の非メンバー。**この人の氏名が漏れてはいけない**
--
--   relay_alpha / relay_bravo / relay_charlie : 3本すべて created_by = u_admin
-- =============================================================================
insert into auth.users (id, email, raw_user_meta_data) values
  ('55550000-0000-4000-a000-000000000001', 'qa-relay-admin@example.test',    '{"name":"QA_RELAY_ADMIN","gender":0}'),
  ('55550000-0000-4000-a000-000000000002', 'qa-relay-swimmer1@example.test', '{"name":"QA_RELAY_SWIMMER_ONE","gender":0}'),
  ('55550000-0000-4000-a000-000000000003', 'qa-relay-swimmer2@example.test', '{"name":"QA_RELAY_SWIMMER_TWO","gender":0}'),
  ('55550000-0000-4000-a000-000000000004', 'qa-relay-left@example.test',     '{"name":"QA_RELAY_LEFT_MEMBER","gender":0}'),
  ('55550000-0000-4000-a000-000000000005', 'qa-relay-outsider@example.test', '{"name":"QA_RELAY_OUTSIDER_SECRET","gender":0}');

-- 露出してはいけない列を埋めて「返らないこと」に意味を持たせる
update public.users
set profile_image_path = id::text || '/avatar.webp'
where id::text like '55550000-0000-4000-a000-%';

insert into public.teams (id, name, invite_code, created_by) values
  ('66660000-0000-4000-a000-00000000000a', 'QA Relay TeamAlpha', 'QA-RELAY-A',
   '55550000-0000-4000-a000-000000000001');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at) values
  ('66660000-0000-4000-a000-00000000000a', '55550000-0000-4000-a000-000000000001', 'admin', 'approved', true,  '2026-01-01'),
  ('66660000-0000-4000-a000-00000000000a', '55550000-0000-4000-a000-000000000002', 'user',  'approved', true,  '2026-01-01'),
  ('66660000-0000-4000-a000-00000000000a', '55550000-0000-4000-a000-000000000003', 'user',  'approved', true,  '2026-01-01'),
  ('66660000-0000-4000-a000-00000000000a', '55550000-0000-4000-a000-000000000004', 'user',  'approved', false, '2026-01-01');
-- u_outsider は意図的に team_memberships へ入れない

-- リレー記録3本。created_by はすべて同一 (バックフィルの状況)
insert into public.relay_records
  (id, team_id, competition_id, relay_kind, leg_distance, leg_count, pool_type,
   gender_category, total_time, created_by)
values
  ('77770000-0000-4000-a000-000000000001', '66660000-0000-4000-a000-00000000000a', null,
   'free', 50, 4, 0, 'male', 120.10, '55550000-0000-4000-a000-000000000001'),
  ('77770000-0000-4000-a000-000000000002', '66660000-0000-4000-a000-00000000000a', null,
   'medley', 50, 4, 0, 'male', 130.20, '55550000-0000-4000-a000-000000000001'),
  ('77770000-0000-4000-a000-000000000003', '66660000-0000-4000-a000-00000000000a', null,
   'free', 100, 4, 1, 'mixed', 240.30, '55550000-0000-4000-a000-000000000001');

-- 1本目に承認済みメンバーのレグを2本 (style_id=2 は 50m自由形)
insert into public.relay_record_legs (id, relay_record_id, leg_index, user_id, style_id, leg_time) values
  ('88880000-0000-4000-a000-000000000001', '77770000-0000-4000-a000-000000000001', 0,
   '55550000-0000-4000-a000-000000000002', 2, 30.01),
  ('88880000-0000-4000-a000-000000000002', '77770000-0000-4000-a000-000000000001', 1,
   '55550000-0000-4000-a000-000000000003', 2, 30.02);

-- =============================================================================
-- V-C2: レグの user_id がチームに拘束されているか
--
-- 🚨 実行順序が重要: C-2 (非破壊) を **先に** 実行する。
--    C-1 の検証は入力者の削除という破壊的操作で、現状 (CASCADE) では
--    リレー記録が全消滅する。先に走らせると C-2 の対象行が消え、
--    「非メンバーの INSERT が弾かれた」ではなく「対象行が無いので
--    どの INSERT も弾かれた」で **偽の緑** になる (実際に一度踏んだ)。
--
--    同じ理由で、この節では正常系 (V-C2-02) を異常系 (V-C2-01) より
--    **先に** 置く。フィクスチャが壊れたら正常系が声を上げて落ちる。
-- =============================================================================
insert into auth.users (id, email, raw_user_meta_data) values
  ('55550000-0000-4000-a000-000000000006', 'qa-relay-admin2@example.test', '{"name":"QA_RELAY_ADMIN_TWO","gender":0}');
insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at) values
  ('66660000-0000-4000-a000-00000000000a', '55550000-0000-4000-a000-000000000006', 'admin', 'approved', true, '2026-01-01');

select public.qa_login_as('55550000-0000-4000-a000-000000000006');

-- 前提: 対象のリレー記録が存在し、管理者から見えていること。
-- ここが 0 だと以降の「弾かれた」は全部無意味になる
select is(
  (select count(*)::int from public.relay_records
   where id = '77770000-0000-4000-a000-000000000002'),
  1,
  'V-C2-00 (前提): レグ挿入対象のリレー記録が存在する');

-- V-C2-02: 承認済みアクティブメンバーなら INSERT できる (非退行)
select lives_ok(
  $$ insert into public.relay_record_legs (relay_record_id, leg_index, user_id, style_id, leg_time)
     values ('77770000-0000-4000-a000-000000000002', 1,
             '55550000-0000-4000-a000-000000000003', 2, 31.50) $$,
  'V-C2-02: 承認済みアクティブメンバーの user_id ならレグを INSERT できる');

-- V-C2-03: 退会済み (approved / is_active=false) メンバーも INSERT できる
--   RPC は退会したメンバーの名前も読める設計 (legs.user_id が SET NULL、
--   RPC が users を LEFT JOIN) なので、述語は「メンバー行が存在するか」であるべき。
--   approved+active で縛ると退会者を含む過去のリレーを編集保存できなくなる。
select lives_ok(
  $$ insert into public.relay_record_legs (relay_record_id, leg_index, user_id, style_id, leg_time)
     values ('77770000-0000-4000-a000-000000000002', 2,
             '55550000-0000-4000-a000-000000000004', 2, 32.00) $$,
  'V-C2-03: 退会済み (is_active=false) メンバーの user_id もレグに入れられる (過去のリレーを編集保存できる)');

-- V-C2-04: user_id が NULL のレグ (泳者不明) は INSERT できる
select lives_ok(
  $$ insert into public.relay_record_legs (relay_record_id, leg_index, user_id, style_id, leg_time)
     values ('77770000-0000-4000-a000-000000000002', 3, null, 2, 33.00) $$,
  'V-C2-04: user_id が NULL のレグは INSERT できる (退会時の SET NULL の着地点でもある)');

-- V-C2-01 (中核): 非メンバーの user_id は弾かれる
select throws_ok(
  $$ insert into public.relay_record_legs (relay_record_id, leg_index, user_id, style_id, leg_time)
     values ('77770000-0000-4000-a000-000000000002', 0,
             '55550000-0000-4000-a000-000000000005', 2, 31.00) $$,
  '42501', null,
  'V-C2-01 (中核): 管理者でも「チーム非メンバーの user_id」でレグを INSERT できない (通ると RPC が他人の本名とアバターパスを返す)');

-- 他チームのリレー記録へのレグ挿入は当然弾かれる (認可の非退行)
select public.qa_logout();

insert into public.teams (id, name, invite_code, created_by) values
  ('66660000-0000-4000-a000-00000000000b', 'QA Relay TeamBravo', 'QA-RELAY-B',
   '55550000-0000-4000-a000-000000000006');
insert into public.relay_records
  (id, team_id, competition_id, relay_kind, leg_distance, leg_count, pool_type,
   gender_category, total_time, created_by)
values
  ('77770000-0000-4000-a000-000000000009', '66660000-0000-4000-a000-00000000000b', null,
   'free', 50, 4, 0, 'male', 125.00, '55550000-0000-4000-a000-000000000006');

select public.qa_login_as('55550000-0000-4000-a000-000000000003'); -- 一般メンバー

select throws_ok(
  $$ insert into public.relay_record_legs (relay_record_id, leg_index, user_id, style_id, leg_time)
     values ('77770000-0000-4000-a000-000000000001', 5,
             '55550000-0000-4000-a000-000000000003', 2, 34.00) $$,
  '42501', null,
  'V-C2-05: 一般メンバー (非管理者) はレグを INSERT できない (認可の非退行)');

select public.qa_logout();

select is(
  (select count(*)::int from public.relay_record_legs
   where relay_record_id = '77770000-0000-4000-a000-000000000002'),
  3,
  'V-C2-06: 通ったレグは3本だけ (承認済み + 退会済み + NULL)。非メンバー分は入っていない');

select is(
  (select count(*)::int from public.relay_record_legs l
     join public.relay_records rr on rr.id = l.relay_record_id
   where rr.team_id = '66660000-0000-4000-a000-00000000000a'
     and l.user_id = '55550000-0000-4000-a000-000000000005'),
  0,
  'V-C2-07: 非メンバー (u_outsider) の user_id を持つレグがこのチームに1行も存在しない');

-- =============================================================================
-- V-C1-02 (中核): 入力した管理者を削除してもリレー記録の行が残る
-- =============================================================================
select is(
  (select count(*)::int from public.relay_records
   where team_id = '66660000-0000-4000-a000-00000000000a'),
  3,
  'V-C1-02a (前提): 削除前はリレー記録が3行ある');

-- 入力者 (= 全行の created_by) を削除する。
-- public.users の削除は auth.users からの CASCADE でも起きるので、
-- ここでは退会処理と同じ public.users 側の削除で確かめる。
delete from public.users where id = '55550000-0000-4000-a000-000000000001';

select is(
  (select count(*)::int from public.relay_records
   where team_id = '66660000-0000-4000-a000-00000000000a'),
  3,
  'V-C1-02b (中核): 入力した管理者を削除してもリレー記録は3行すべて残る (CASCADE だと0行になる)');

select is(
  (select count(*)::int from public.relay_records
   where team_id = '66660000-0000-4000-a000-00000000000a' and created_by is null),
  3,
  'V-C1-02c: 残った行の created_by は NULL になる (誰が入れたかは失うが記録は失わない)');

select is(
  (select count(*)::int from public.relay_record_legs
   where relay_record_id = '77770000-0000-4000-a000-000000000001'),
  2,
  'V-C1-02d: 親が残るのでレグも2行残る (親が消えると CASCADE でレグも消える)');

-- =============================================================================
-- V-C1-03: 泳者の削除ではレグが残り user_id が NULL になる (既存挙動の非退行)
-- =============================================================================
delete from public.users where id = '55550000-0000-4000-a000-000000000002';

select is(
  (select count(*)::int from public.relay_record_legs
   where relay_record_id = '77770000-0000-4000-a000-000000000001'),
  2,
  'V-C1-03a: 泳者を削除してもレグ行は残る (消すとリレー1本が3レグに欠ける)');

select is(
  (select user_id from public.relay_record_legs
   where id = '88880000-0000-4000-a000-000000000001'),
  null::uuid,
  'V-C1-03b: 削除された泳者のレグは user_id が NULL になる (ON DELETE SET NULL)');

-- =============================================================================
-- V-C1-04: team_id は CASCADE のまま (誤って SET NULL にしていないか)
-- =============================================================================
select is(
  (select c.confdeltype
   from pg_constraint c
   where c.conname = 'relay_records_team_id_fkey'
     and c.conrelid = 'public.relay_records'::regclass),
  'c'::"char",
  'V-C1-04: relay_records.team_id は ON DELETE CASCADE のまま (チーム記録なのでチーム削除で消えるのが正しい)');

select * from finish();
rollback;
