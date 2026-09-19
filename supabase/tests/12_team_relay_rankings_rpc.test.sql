-- =============================================================================
-- pgTAP: get_team_relay_rankings RPC + relay_records / relay_record_legs の実DB検証
--        (QA Sprint Contract Phase B / 第3弾: リレーのチーム記録化)
--
-- 対象 migration:
--   20260908000000_add_relay_records.sql
--   20260908000100_team_relay_rankings_rpc.sql
--
-- 第1弾の 11_team_record_rankings_rpc.test.sql と同型。fixture は**独立に作成**
-- しており、Web Dev の実測結果や第1弾の fixture を流用していない。
--
-- なぜ実 DB で検証するか:
--   この RPC は SECURITY DEFINER で relay_records / relay_record_legs / users の
--   RLS をバイパスする。「誰が呼べるか」「どの行が集計されるか」「どの列を返すか」の
--   3つが唯一の防御線であり、どれも Supabase クライアントのモックでは検証できない
--   (モックは自分が書いた述語をそのまま返すだけなのでトートロジーになる)。
--   さらに **TRUNCATE は RLS を通らない**ので、RLS ポリシーをいくら書いても
--   GRANT を実測しない限り「ログイン済みユーザーがテーブルを空にできる」状態を
--   検出できない (第1弾で実証済みの罠)。
--
-- 観点:
--   V-DB-60: 関数のセキュリティ属性と実行権限
--            (SECURITY DEFINER / STABLE / search_path 固定 / anon 実行不可)
--   V-DB-61: 返す列の allowlist。created_by / users の機微列を返さない。
--            引数もちょうど7つで p_aggregation が復活していない
--   V-DB-62: テーブル権限。**authenticated から TRUNCATE が剥がれている**
--            (RLS を通らないため RLS だけでは防げない)
--   V-DB-63: 認可ガード。未認証 / 非メンバー / **承認待ち** / 非アクティブは例外。
--            承認済み非管理者は読める (閲覧は管理者限定ではない)
--   V-DB-64: 入力値ガード。NULL は三値論理でガードを素通りするので `IS NULL` で
--            先に弾く (p_relay_kind / p_aggregation / p_leg_distance / p_pool_type)。
--            **p_gender_category の NULL は「すべて」なので例外にしない** (対で押さえる)
--   V-DB-65: 絞り込みの厳密一致 (種類 / 1レグ距離 / 水路 / チーム)
--   V-DB-66: competitions は LEFT JOIN。大会に紐づかない行が落ちない
--   V-DB-67: 🚨 レグの母集団が team_memberships で縛られている (Reviewer C-2)。
--            非メンバーの user_id を持つレグは **行が落ちるのではなく
--            displayName / avatarPath が NULL になる**
--   V-DB-68: p_limit のクランプ (0 / 負数 / NULL / 巨大値でも例外にしない)
--   V-DB-69: legs (JSONB) の順序 / キー allowlist (8キー) / 区間タイムであること /
--            **退会した泳者のレグで行が欠けない** / レグ 0 件でも行が返る /
--            **`avatarPath` キーが存在しないこと** (`->>` では検出できないので `?` で見る)
--   V-DB-70: users の機微列 (bio / refresh_token) が返らない
--   V-DB-71: RLS の書き込み。非管理者の INSERT は拒否、非メンバーの SELECT は 0 行
--   V-DB-72: 並び順と同着のタイブレーク / 年度
--
-- ⚠️ Sprint 途中の PM 裁定で 2 つの要素が**廃止**された (2026-09-08 実測):
--     - `relay_records.note` 列 … 非 NULL を書く経路がどこにも無かった。
--       これに伴い shared の `findExistingRelayForNote` も削除。
--     - `p_aggregation` ('allRaces' / 'teamBest') … UI から到達不能で、かつ
--       `p_gender_category = NULL` のとき性別区分をまたいで最速1本を返すため
--       「そのチームの最速」として意味を持たなかった。
--   よって本ファイルからも「note が返らない」「teamBest の意味」の観点を撤去した。
--   **緩めたのではなく対象が消えた**。復活させるならテストも一緒に戻すこと。
--
-- 実行: ローカル Supabase 起動済み + migration 適用済みで `supabase test db`。
--       全フィクスチャは rollback で消える。
--
-- ⚠️ fixture 作成上の注意 (第1弾で踏んだ罠を踏襲):
--   - auth.users への INSERT は on_auth_user_created トリガーが public.users を
--     自動生成する。public.users へ直接 INSERT すると PK 重複になる。
--   - public.teams の作成者列は created_by (user_id ではない)。
--   - 件数の期待値に 1 / 2 を使わない (3, 4, 5, 7 を使う)。
--     fixture 名も期待値の部分文字列にならない語を選ぶ。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(70);

-- -----------------------------------------------------------------------------
-- ヘルパー: JWT クレーム + ロール切替 (01/04/10/11 の各テストと同型)
-- -----------------------------------------------------------------------------
create or replace function public.qa_relay_login_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function public.qa_relay_login_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end $$;

create or replace function public.qa_relay_logout() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

-- =============================================================================
-- V-DB-60: セキュリティ属性と実行権限
-- =============================================================================
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_team_relay_rankings'),
  true,
  'V-DB-60a: SECURITY DEFINER である (退会メンバー名の表示のため users の RLS をバイパスする)');

select is(
  (select provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_team_relay_rankings'),
  's'::"char",
  'V-DB-60b: STABLE である (読み取り専用)');

select ok(
  (select 'search_path=public' = any(proconfig)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_team_relay_rankings'),
  'V-DB-60c: search_path が public に固定されている (SECURITY DEFINER の必須対策)');

select ok(
  not has_function_privilege('anon',
    -- ⚠️ シグネチャは migration 20260909000000 で `p_fiscal_year_or_earlier boolean`
    --    が増えた (「2023年度以前」が単一整数では表現できないため)。
    --    旧シグネチャは DROP されているので、ここを更新しないと
    --    `function ... does not exist` でファイル全体が Bad plan になる
    --    (実測: planned 66 ran 7)。同名関数が1つだけであることは
    --    `14_fiscal_year_boundary.test.sql` の V-DB-85 が担保する。
    'public.get_team_relay_rankings(uuid, text, integer, smallint, text, integer, boolean, integer)',
    'EXECUTE'),
  'V-DB-60d: anon は EXECUTE できない (REVOKE 済み)');

select ok(
  has_function_privilege('authenticated',
    'public.get_team_relay_rankings(uuid, text, integer, smallint, text, integer, boolean, integer)',
    'EXECUTE'),
  'V-DB-60e: authenticated は EXECUTE できる');

select ok(
  has_function_privilege('service_role',
    'public.get_team_relay_rankings(uuid, text, integer, smallint, text, integer, boolean, integer)',
    'EXECUTE'),
  'V-DB-60f: service_role は EXECUTE できる (バックフィル用)');

-- =============================================================================
-- V-DB-61: 返す列の allowlist (情報露出の防御線)
--
-- results_eq は unnest(text[]) 由来の列の collation を決められずエラーになるため
-- 配列に畳んで is() で比較する (第1弾と同じ)。
-- =============================================================================
select is(
  (select array_agg(a.name::text order by a.ord)
   from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace,
     unnest(p.proargnames, p.proargmodes) with ordinality as a(name, mode, ord)
   where n.nspname = 'public'
     and p.proname = 'get_team_relay_rankings'
     and a.mode = 't'),
  ARRAY['relay_record_id', 'relay_kind', 'leg_distance', 'leg_count', 'pool_type',
        'gender_category', 'total_time', 'competition_id', 'competition_title',
        'competition_date', 'relay_created_at', 'legs']::text[],
  'V-DB-61a: RETURNS TABLE の列は表示に必要な12列のみ (順序も固定)');

select is(
  (select count(*)::int
   from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace,
     unnest(p.proargnames, p.proargmodes) as a(name, mode)
   where n.nspname = 'public'
     and p.proname = 'get_team_relay_rankings'
     and a.mode = 't'
     and a.name in ('note', 'created_by', 'birthday', 'bio',
                    'google_calendar_refresh_token', 'updated_at')),
  0,
  'V-DB-61b: 非公開前提の列 (入力者/誕生日/自己紹介/refresh_token) を返さない');

-- 引数の pin。p_aggregation は PM 裁定で廃止したので**復活していないこと**を
-- 否定形で押さえる (再導入するなら PARTITION BY gender_category を伴う設計が必要)。
select is(
  (select array_agg(a.name::text order by a.ord)
   from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace,
     unnest(p.proargnames, p.proargmodes) with ordinality as a(name, mode, ord)
   where n.nspname = 'public'
     and p.proname = 'get_team_relay_rankings'
     and a.mode = 'i'),
  -- ⚠️ migration 20260909000000 で `p_fiscal_year_or_earlier boolean` が
  --    `p_fiscal_year` の直後に増えた (「2023年度以前」= 下端なしの表現)。
  --    **`p_aggregation` は依然として無い** — リレーに「1チーム1行へ畳む単位」が
  --    無いという PM 裁定は変わっていないので、否定形はそのまま維持する。
  ARRAY['p_team_id', 'p_relay_kind', 'p_leg_distance', 'p_pool_type',
        'p_gender_category', 'p_fiscal_year', 'p_fiscal_year_or_earlier',
        'p_limit']::text[],
  'V-DB-61c: 入力引数はちょうど8つで p_aggregation を含まない (順序も固定)');

select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name = 'relay_records' and column_name = 'note'),
  0,
  'V-DB-61d: relay_records に note 列が無い (非 NULL を書く経路が無く PM 裁定で撤去)');

-- =============================================================================
-- V-DB-62: テーブル権限 — TRUNCATE が authenticated から剥がれていること
--
-- 🚨 新規テーブルは initial_schema.sql の ALTER DEFAULT PRIVILEGES により
--    作成時点で anon / authenticated に GRANT ALL が付く。
--    **TRUNCATE は RLS を通らない**ので、RLS ポリシーを書いただけでは
--    ログイン済みユーザーがテーブルを丸ごと空にできてしまう。
-- =============================================================================
select ok(
  has_table_privilege('authenticated', 'public.relay_records', 'SELECT')
  and has_table_privilege('authenticated', 'public.relay_records', 'INSERT')
  and has_table_privilege('authenticated', 'public.relay_records', 'UPDATE')
  and has_table_privilege('authenticated', 'public.relay_records', 'DELETE'),
  'V-DB-62a: authenticated には 4 つの DML 権限が付いている (行レベルの可否は RLS が決める)');

select ok(
  not has_table_privilege('authenticated', 'public.relay_records', 'TRUNCATE'),
  'V-DB-62b: authenticated は relay_records を TRUNCATE できない (RLS では防げない経路)');

select ok(
  not has_table_privilege('authenticated', 'public.relay_record_legs', 'TRUNCATE'),
  'V-DB-62c: authenticated は relay_record_legs を TRUNCATE できない');

select is(
  (select count(*)::int from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'
     and table_name in ('relay_records', 'relay_record_legs')),
  0,
  'V-DB-62d: anon には relay 2 表のいかなる権限も無い (REVOKE ALL 済み)');

-- =============================================================================
-- フィクスチャ
--
-- チーム: HomeSquad (検証対象) / AwaySquad (他チーム)
--
-- メンバー (すべて HomeSquad に対する状態):
--   r_admin     承認済み・アクティブ・admin  … 入力者 (created_by)
--   r_member    承認済み・アクティブ・user   … 一般メンバー。読めるべき / 書けないべき
--   r_pending   **承認待ち**                 … 読めてはいけない
--   r_inactive  承認済みだが is_active=false … 読めてはいけない
--   r_outsider  HomeSquad の非メンバー       … 読めてはいけない (AwaySquad の admin)
--   r_retired   承認済み・アクティブ         … fixture 作成後に **削除** して
--                                              ON DELETE SET NULL を実証する
--
-- 名前・タイトルは期待値 (タイム/件数) の部分文字列にならない語を使う。
-- =============================================================================
insert into auth.users (id, email, raw_user_meta_data) values
  ('44440000-0000-4000-a000-000000000001', 'qa-relay-admin@example.test',
   '{"name":"QA_RELAY_ADMIN","gender":0}'),
  ('44440000-0000-4000-a000-000000000002', 'qa-relay-member@example.test',
   '{"name":"QA_RELAY_MEMBER","gender":1}'),
  ('44440000-0000-4000-a000-000000000003', 'qa-relay-pending@example.test',
   '{"name":"QA_RELAY_PENDING","gender":1}'),
  ('44440000-0000-4000-a000-000000000004', 'qa-relay-inactive@example.test',
   '{"name":"QA_RELAY_INACTIVE","gender":0}'),
  ('44440000-0000-4000-a000-000000000005', 'qa-relay-outsider@example.test',
   '{"name":"QA_RELAY_OUTSIDER","gender":1}'),
  ('44440000-0000-4000-a000-000000000006', 'qa-relay-retired@example.test',
   '{"name":"QA_RELAY_RETIRED","gender":0}');

-- 露出してはいけない列を埋めて「返らないこと」に意味を持たせる (V-DB-61 / V-DB-70 の裏付け)
update public.users
set profile_image_path = id::text || '/avatar.webp',
    birthday = '2003-04-05',
    bio = 'QA_RELAY_HIDDEN_BIO',
    google_calendar_refresh_token = 'QA_RELAY_HIDDEN_TOKEN'
where id in (
  '44440000-0000-4000-a000-000000000001','44440000-0000-4000-a000-000000000002',
  '44440000-0000-4000-a000-000000000003','44440000-0000-4000-a000-000000000004',
  '44440000-0000-4000-a000-000000000005','44440000-0000-4000-a000-000000000006');

insert into public.teams (id, name, invite_code, created_by) values
  ('55550000-0000-4000-a000-00000000000a', 'QA Relay HomeSquad', 'QA-RELAY-HOME',
   '44440000-0000-4000-a000-000000000001'),
  ('55550000-0000-4000-a000-00000000000b', 'QA Relay AwaySquad', 'QA-RELAY-AWAY',
   '44440000-0000-4000-a000-000000000005');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at) values
  ('55550000-0000-4000-a000-00000000000a', '44440000-0000-4000-a000-000000000001', 'admin', 'approved', true,  '2026-01-01'),
  ('55550000-0000-4000-a000-00000000000a', '44440000-0000-4000-a000-000000000002', 'user',  'approved', true,  '2026-01-01'),
  ('55550000-0000-4000-a000-00000000000a', '44440000-0000-4000-a000-000000000003', 'user',  'pending',  true,  '2026-01-01'),
  ('55550000-0000-4000-a000-00000000000a', '44440000-0000-4000-a000-000000000004', 'user',  'approved', false, '2026-01-01'),
  ('55550000-0000-4000-a000-00000000000a', '44440000-0000-4000-a000-000000000006', 'user',  'approved', true,  '2026-01-01'),
  ('55550000-0000-4000-a000-00000000000b', '44440000-0000-4000-a000-000000000005', 'admin', 'approved', true,  '2026-01-01');

-- 大会
--   MeetPrimary  HomeSquad / 2026-05-03 (2026年度)
--   MeetLater    HomeSquad / 2026-11-21 (2026年度)
--   MeetOffseason HomeSquad / 2027-08-09 (2027年度 = 年度フィルタの外)
--   MeetAway     AwaySquad / 2026-06-07
insert into public.competitions (id, user_id, team_id, title, date, pool_type) values
  ('66660000-0000-4000-a000-000000000001', '44440000-0000-4000-a000-000000000001',
   '55550000-0000-4000-a000-00000000000a', 'QA Relay MeetPrimary',   '2026-05-03', 1),
  ('66660000-0000-4000-a000-000000000002', '44440000-0000-4000-a000-000000000001',
   '55550000-0000-4000-a000-00000000000a', 'QA Relay MeetLater',     '2026-11-21', 1),
  ('66660000-0000-4000-a000-000000000003', '44440000-0000-4000-a000-000000000001',
   '55550000-0000-4000-a000-00000000000a', 'QA Relay MeetOffseason', '2027-08-09', 1),
  ('66660000-0000-4000-a000-000000000004', '44440000-0000-4000-a000-000000000005',
   '55550000-0000-4000-a000-00000000000b', 'QA Relay MeetAway',      '2026-06-07', 1);

-- ---------------------------------------------------------------------------
-- リレー記録
--
-- 【主軸】free / leg_distance=100 / pool_type=1 (長水路) — HomeSquad に 3 本
--   210.00  male   MeetPrimary
--   213.55  female MeetLater
--   219.07  mixed  **大会なし** (competition_id IS NULL → LEFT JOIN の検証)
--
-- 【混ざってはいけない行】
--   205.00  free 100 **pool_type=0**  … 短水路。長水路のランキングに出ない
--   208.00  **medley** 100 pool 1     … 種類違い
--   400.00  free **200** pool 1       … 1レグ距離違い
--   200.00  free 100 pool 1 / **AwaySquad** … 他チーム (全体最速なので漏れれば必ず先頭に出る)
--
-- 【legs 検証用の別軸】
--   free 25  pool 1 / leg_count=7 / 100.00 … レグを**挿入順シャッフル**で入れる
--   free 50  pool 1 / 130.00              … レグ **0 件** (COALESCE '[]' の検証)
--   free 50  pool 1 / 140.00              … 退会する泳者を含む
--
-- 【同着タイブレーク用の別軸】free 400 pool 1 に 300.00 を 3 本
--   MeetLater(2026-11-21) / MeetPrimary(2026-05-03) / 大会なし
--   → 期待順は Primary → Later → 大会なし (date ASC NULLS LAST)
-- ---------------------------------------------------------------------------
insert into public.relay_records
  (id, team_id, competition_id, relay_kind, leg_distance, leg_count, pool_type,
   gender_category, total_time, created_by)
values
  ('77770000-0000-4000-a000-000000000001', '55550000-0000-4000-a000-00000000000a',
   '66660000-0000-4000-a000-000000000001', 'free',   100, 4, 1, 'male',   210.00,
   '44440000-0000-4000-a000-000000000001'),
  ('77770000-0000-4000-a000-000000000002', '55550000-0000-4000-a000-00000000000a',
   '66660000-0000-4000-a000-000000000002', 'free',   100, 4, 1, 'female', 213.55,
   '44440000-0000-4000-a000-000000000001'),
  ('77770000-0000-4000-a000-000000000003', '55550000-0000-4000-a000-00000000000a',
   null,                                   'free',   100, 4, 1, 'mixed',  219.07,
   '44440000-0000-4000-a000-000000000001'),
  ('77770000-0000-4000-a000-000000000004', '55550000-0000-4000-a000-00000000000a',
   '66660000-0000-4000-a000-000000000001', 'free',   100, 4, 0, 'male',   205.00,
   '44440000-0000-4000-a000-000000000001'),
  ('77770000-0000-4000-a000-000000000005', '55550000-0000-4000-a000-00000000000a',
   '66660000-0000-4000-a000-000000000001', 'medley', 100, 4, 1, 'male',   208.00,
   '44440000-0000-4000-a000-000000000001'),
  ('77770000-0000-4000-a000-000000000006', '55550000-0000-4000-a000-00000000000a',
   '66660000-0000-4000-a000-000000000001', 'free',   200, 4, 1, 'male',   400.00,
   '44440000-0000-4000-a000-000000000001'),
  ('77770000-0000-4000-a000-000000000007', '55550000-0000-4000-a000-00000000000b',
   '66660000-0000-4000-a000-000000000004', 'free',   100, 4, 1, 'male',   200.00,
   '44440000-0000-4000-a000-000000000005'),
  ('77770000-0000-4000-a000-000000000008', '55550000-0000-4000-a000-00000000000a',
   '66660000-0000-4000-a000-000000000001', 'free',    25, 7, 1, 'male',   100.00,
   '44440000-0000-4000-a000-000000000001'),
  ('77770000-0000-4000-a000-000000000009', '55550000-0000-4000-a000-00000000000a',
   '66660000-0000-4000-a000-000000000001', 'free',    50, 4, 1, 'male',   130.00,
   '44440000-0000-4000-a000-000000000001'),
  ('77770000-0000-4000-a000-00000000000a', '55550000-0000-4000-a000-00000000000a',
   '66660000-0000-4000-a000-000000000001', 'free',    50, 4, 1, 'mixed',  140.00,
   '44440000-0000-4000-a000-000000000001'),
  ('77770000-0000-4000-a000-00000000000b', '55550000-0000-4000-a000-00000000000a',
   '66660000-0000-4000-a000-000000000002', 'free',   400, 4, 1, 'male',   300.00,
   '44440000-0000-4000-a000-000000000001'),
  ('77770000-0000-4000-a000-00000000000c', '55550000-0000-4000-a000-00000000000a',
   '66660000-0000-4000-a000-000000000001', 'free',   400, 4, 1, 'male',   300.00,
   '44440000-0000-4000-a000-000000000001'),
  ('77770000-0000-4000-a000-00000000000d', '55550000-0000-4000-a000-00000000000a',
   null,                                   'free',   400, 4, 1, 'male',   300.00,
   '44440000-0000-4000-a000-000000000001'),
  -- 年度フィルタの外 (2027年度)
  ('77770000-0000-4000-a000-00000000000e', '55550000-0000-4000-a000-00000000000a',
   '66660000-0000-4000-a000-000000000003', 'free',   100, 4, 1, 'male',   217.00,
   '44440000-0000-4000-a000-000000000001');

-- ---------------------------------------------------------------------------
-- レグ
--   styles.id (実 DB 実測): Fr 25=1 / 50=2 / 100=3 ・ Br 100=10 ・ Ba 100=14 ・ Fly 100=18
--
-- rr-0001 (free 100 / 4 レグ) の leg_time は **区間タイム**。
--   区間: 51.20, 53.10, 52.75, 52.95  (総和 = 210.00 = total_time)
--   通算: 51.20, 104.30, 157.05, 210.00 ← これが legs に入っていたら退行
-- ---------------------------------------------------------------------------
insert into public.relay_record_legs
  (relay_record_id, leg_index, user_id, style_id, leg_time, reaction_time)
values
  ('77770000-0000-4000-a000-000000000001', 0, '44440000-0000-4000-a000-000000000001', 3, 51.20, null),
  ('77770000-0000-4000-a000-000000000001', 1, '44440000-0000-4000-a000-000000000002', 3, 53.10, 0.31),
  ('77770000-0000-4000-a000-000000000001', 2, '44440000-0000-4000-a000-000000000003', 3, 52.75, 0.28),
  ('77770000-0000-4000-a000-000000000001', 3, '44440000-0000-4000-a000-000000000004', 3, 52.95, 0.33);

-- メドレーは背 → 平 → バタ → 自 (styles.id が 4 レグで別々になる)
insert into public.relay_record_legs
  (relay_record_id, leg_index, user_id, style_id, leg_time, reaction_time)
values
  ('77770000-0000-4000-a000-000000000005', 0, '44440000-0000-4000-a000-000000000001', 14, 52.00, null),
  ('77770000-0000-4000-a000-000000000005', 1, '44440000-0000-4000-a000-000000000002', 10, 52.00, 0.30),
  ('77770000-0000-4000-a000-000000000005', 2, '44440000-0000-4000-a000-000000000003', 18, 52.00, 0.30),
  ('77770000-0000-4000-a000-000000000005', 3, '44440000-0000-4000-a000-000000000004',  3, 52.00, 0.30);

-- ⚠️ 7 レグを **挿入順をシャッフルして** 入れる (4,1,6,0,3,5,2)。
--    jsonb_agg に ORDER BY が無い / 物理順に依存する実装ならここで崩れる。
insert into public.relay_record_legs
  (relay_record_id, leg_index, user_id, style_id, leg_time, reaction_time)
values
  ('77770000-0000-4000-a000-000000000008', 4, '44440000-0000-4000-a000-000000000001', 1, 14.00, 0.30),
  ('77770000-0000-4000-a000-000000000008', 1, '44440000-0000-4000-a000-000000000002', 1, 14.50, 0.30),
  ('77770000-0000-4000-a000-000000000008', 6, '44440000-0000-4000-a000-000000000003', 1, 14.50, 0.30),
  ('77770000-0000-4000-a000-000000000008', 0, '44440000-0000-4000-a000-000000000004', 1, 14.00, null),
  ('77770000-0000-4000-a000-000000000008', 3, '44440000-0000-4000-a000-000000000006', 1, 14.50, 0.30),
  ('77770000-0000-4000-a000-000000000008', 5, '44440000-0000-4000-a000-000000000001', 1, 14.50, 0.30),
  ('77770000-0000-4000-a000-000000000008', 2, '44440000-0000-4000-a000-000000000002', 1, 14.00, 0.30);

-- 退会する泳者 (r_retired) を第1泳者に含むリレー
insert into public.relay_record_legs
  (relay_record_id, leg_index, user_id, style_id, leg_time, reaction_time)
values
  ('77770000-0000-4000-a000-00000000000a', 0, '44440000-0000-4000-a000-000000000006', 2, 34.00, null),
  ('77770000-0000-4000-a000-00000000000a', 1, '44440000-0000-4000-a000-000000000001', 2, 35.00, 0.30),
  ('77770000-0000-4000-a000-00000000000a', 2, '44440000-0000-4000-a000-000000000002', 2, 35.50, 0.30),
  ('77770000-0000-4000-a000-00000000000a', 3, '44440000-0000-4000-a000-000000000004', 2, 35.50, 0.30);

-- rr-0009 には**レグを1件も入れない** (COALESCE '[]' の検証用)

-- =============================================================================
-- V-DB-63: 認可ガード
-- =============================================================================
select public.qa_relay_login_anon();

select throws_ok(
  $$ select * from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) $$,
  '42501', null,
  'V-DB-63a: anon が直接呼ぶと GRANT 層で 42501 拒否される');

select public.qa_relay_logout();

-- authenticated だが JWT 無し (auth.uid() IS NULL)
select set_config('request.jwt.claims', '', true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select * from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) $$,
  'P0001', null,
  'V-DB-63b: auth.uid() が NULL のとき関数内ガードが例外にする');

select public.qa_relay_logout();

select public.qa_relay_login_as('44440000-0000-4000-a000-000000000005');

select throws_ok(
  $$ select * from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) $$,
  'P0001', null,
  'V-DB-63c: 非メンバーは例外 (他チームのリレー記録を覗けない)');

select public.qa_relay_logout();

select public.qa_relay_login_as('44440000-0000-4000-a000-000000000003');

select throws_ok(
  $$ select * from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) $$,
  'P0001', null,
  'V-DB-63d: 承認待ち (status=pending) は例外。is_active だけの判定 (is_team_member 相当) では通ってしまう');

select public.qa_relay_logout();

select public.qa_relay_login_as('44440000-0000-4000-a000-000000000004');

select throws_ok(
  $$ select * from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) $$,
  'P0001', null,
  'V-DB-63e: 非アクティブ (is_active=false) は例外');

select public.qa_relay_logout();

-- 以降は承認済み**非管理者**でログインしたまま実行する。
-- 「閲覧は管理者限定ではない」ことがこの後の全テストで同時に担保される。
select public.qa_relay_login_as('44440000-0000-4000-a000-000000000002');

select lives_ok(
  $$ select * from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) $$,
  'V-DB-63f: 承認済みかつアクティブな**非管理者**は呼べる (閲覧は管理者限定ではない)');

-- =============================================================================
-- V-DB-64: 入力値ガード
--
-- ⚠️ `NULL NOT IN (...)` は FALSE ではなく **NULL** で、plpgsql の IF は NULL を
--    偽として扱うためガードを素通りする (第1弾で実測した罠)。素通りすると
--    p_relay_kind := NULL は「エラーではなく空のランキング」に化け、
--    p_aggregation := NULL は静かに teamBest 相当に落ちる。
-- =============================================================================
select throws_ok(
  $$ select * from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'mixedRelay', 100, 1::smallint) $$,
  'P0001', null,
  'V-DB-64a: 未知の relay_kind は例外 (黙って 0 件を返さない)');

select throws_ok(
  $$ select * from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, null, 100, 1::smallint) $$,
  'P0001', null,
  'V-DB-64b: p_relay_kind = NULL は例外 (三値論理でガードを素通りしていない)');

select throws_ok(
  $$ select * from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', null, 1::smallint) $$,
  'P0001', null,
  'V-DB-64e: p_leg_distance = NULL は例外 (空のランキングに化けない)');

select throws_ok(
  $$ select * from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, null) $$,
  'P0001', null,
  'V-DB-64f: p_pool_type = NULL は例外 (空のランキングに化けない)');

select throws_ok(
  $$ select * from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint, 'coed') $$,
  'P0001', null,
  'V-DB-64g: 非 NULL の未知 gender_category は例外');

-- ⚠️ ここが p_gender_category の**対になる**テスト。
--    「NULL を全部弾く」という過剰なガードにすると
--    「すべての性別区分」という正当な問い合わせが不能になる。
select lives_ok(
  $$ select * from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint, null) $$,
  'V-DB-64h: p_gender_category = NULL は例外にしない (「すべて」を意味する唯一の引数)');

select results_eq(
  $$ select gender_category from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint, null,
       2026) $$,
  $$ values ('male'::text), ('female'::text) $$,
  'V-DB-64i: p_gender_category = NULL は male/female/mixed を区別せず全部返す');

-- =============================================================================
-- V-DB-65: 絞り込みの厳密一致
-- =============================================================================
select results_eq(
  $$ select total_time from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) $$,
  $$ values (210.00::numeric), (213.55::numeric), (217.00::numeric), (219.07::numeric) $$,
  'V-DB-65a: free × 100m × 長水路 は該当 4 本を総合タイム昇順で返す');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint)
   where total_time = 205.00),
  0,
  'V-DB-65b: 短水路 (pool_type=0) の 205.00 は長水路のランキングに混ざらない');

select results_eq(
  $$ select total_time from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 0::smallint) $$,
  $$ values (205.00::numeric) $$,
  'V-DB-65c: 短水路を指定すれば 205.00 が返る (水路は厳密一致で両方向に効く)');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint)
   where total_time = 208.00),
  0,
  'V-DB-65d: メドレーリレーの 208.00 はフリーリレーのランキングに混ざらない');

select results_eq(
  $$ select total_time from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'medley', 100, 1::smallint) $$,
  $$ values (208.00::numeric) $$,
  'V-DB-65e: medley を指定すれば 208.00 が返る');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint)
   where total_time in (400.00, 200.00)),
  0,
  'V-DB-65f: 1レグ 200m の 400.00 と**他チーム**の 200.00 は混ざらない (200.00 は全体最速なので漏れれば必ず先頭に出る)');

-- pool_type の異常値は relay_records では**構造的に存在し得ない**。
-- (records.pool_type には CHECK が無いため 11_ 側は異常値行を作って検証したが、
--  こちらは CHECK が入口で弾く = より強い保証。その CHECK 自体を実測する)
--
-- ⚠️ この INSERT は **管理者**で実行する。非管理者のままだと RLS が先に 42501 で
--    弾いてしまい、CHECK 制約 (23514) に到達しないため「CHECK があること」の
--    検証にならない (最初にこれを踏んだ)。
select public.qa_relay_logout();
select public.qa_relay_login_as('44440000-0000-4000-a000-000000000001');

select throws_ok(
  $$ insert into public.relay_records
       (team_id, competition_id, relay_kind, leg_distance, leg_count, pool_type,
        gender_category, total_time, created_by)
     values ('55550000-0000-4000-a000-00000000000a'::uuid, null, 'free', 100, 4, 5,
             'male', 250.00, '44440000-0000-4000-a000-000000000001'::uuid) $$,
  '23514', null,
  'V-DB-65g: pool_type=5 は CHECK 制約が INSERT を弾く (異常値がランキングのバケツに入る余地が無い)');

-- 以降の観点は「一般メンバーでも読める」ことと対で確認したいので非管理者に戻す
select public.qa_relay_logout();
select public.qa_relay_login_as('44440000-0000-4000-a000-000000000002');

-- =============================================================================
-- V-DB-66: competitions は LEFT JOIN (大会に紐づかない行が落ちない)
-- =============================================================================
select results_eq(
  $$ select competition_id, competition_title, competition_date
     from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint)
     where total_time = 219.07 $$,
  $$ values (null::uuid, null::text, null::date) $$,
  'V-DB-66a: competition_id IS NULL の行が返る (INNER JOIN なら静かに 0 件になる)');

select results_eq(
  $$ select competition_title from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint)
     where total_time = 210.00 $$,
  $$ values ('QA Relay MeetPrimary'::text) $$,
  'V-DB-66b: 大会ありの行は大会名が入る');

-- =============================================================================
-- V-DB-67: 🚨 レグの母集団が team_memberships で縛られている (Reviewer C-2)
--
-- SECURITY DEFINER の RPC は users の RLS をバイパスする。レグの
-- `LEFT JOIN public.users` に所属条件が無いと、**非メンバーの user_id を持つ
-- レグを1行入れるだけでその人の本名とアバターパスが返る** (素の users SELECT は
-- RLS で0行なのに RPC 経由では見える)。
--
-- 正しい挙動は「行を落とす」ではなく「displayName / avatarPath を NULL にする」。
-- レグ自体を落とすと通算タイムの積み上げがずれる (4レグが3レグに欠ける)。
--
-- ⚠️ 所属条件に status / is_active を**含めてはいけない**。退会は
--    team_memberships の行を残して is_active=false にする実装なので、含めると
--    退会したメンバーの名前が過去のチーム記録から消える。
--    (この観点は supabase/tests/13_relay_records_authz_and_fk.test.sql の
--     V-C2-03 と対になっている。あちらは RLS の INSERT 側、こちらは RPC の読み取り側)
-- =============================================================================
-- 非メンバー (AwaySquad の admin) の user_id を持つレグを HomeSquad のリレーに
-- 仕込む。RLS は所有者 (postgres) には効かないのでフィクスチャとして作れる。
select public.qa_relay_logout();

insert into public.relay_record_legs
  (relay_record_id, leg_index, user_id, style_id, leg_time, reaction_time)
values
  ('77770000-0000-4000-a000-000000000002', 0, '44440000-0000-4000-a000-000000000005', 3, 53.00, null),
  ('77770000-0000-4000-a000-000000000002', 1, '44440000-0000-4000-a000-000000000002', 3, 53.55, 0.30);

select public.qa_relay_login_as('44440000-0000-4000-a000-000000000002');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) r,
     jsonb_array_elements(r.legs) as leg
   where r.total_time = 213.55),
  2,
  'V-DB-67a: 非メンバーの user_id を持つレグでも**行は落ちない** (落とすと通算がずれる)');

-- 🚨 トートロジーの除去 (2026-09-08)
--    以前はここで `leg->>'avatarPath'` も NULL であることを assert していたが、
--    **`->>` は存在しないキーに対しても NULL を返す**ため、
--    `avatarPath` を jsonb_build_object から削除した後も green のまま通っていた
--    (= 何も検証していない)。アバターは RPC が返さなくなったので、
--    「NULL であること」ではなく **「キーが存在しないこと」** を
--    V-DB-69c / V-DB-69i で押さえ、ここは `displayName` 1つに絞る。
select results_eq(
  $$ select leg->>'displayName'
     from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) r,
       jsonb_array_elements(r.legs) as leg
     where r.total_time = 213.55 and (leg->>'legIndex')::int = 0 $$,
  $$ values (null::text) $$,
  'V-DB-67b (中核): 非メンバーの本名は NULL になる (SECURITY DEFINER の情報露出を塞いでいる)');

-- displayName が「キーごと無い」のではなく「キーはあって値が NULL」であること。
-- ここを取り違えると V-DB-67b が上と同じ理由でトートロジー化する。
select ok(
  (select bool_and(leg ? 'displayName')
   from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) r,
     jsonb_array_elements(r.legs) as leg
   where r.total_time = 213.55),
  'V-DB-67b2: displayName は**キーとして存在**し値が NULL である (`->>` が常に NULL を返すだけの状態ではない)');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) r,
     jsonb_array_elements(r.legs) as leg
   where r.total_time = 213.55 and leg->>'displayName' = 'QA_RELAY_OUTSIDER'),
  0,
  'V-DB-67c: 非メンバーの氏名が返り値のどこにも現れない');

select results_eq(
  $$ select leg->>'displayName'
     from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) r,
       jsonb_array_elements(r.legs) as leg
     where r.total_time = 213.55 and (leg->>'legIndex')::int = 1 $$,
  $$ values ('QA_RELAY_MEMBER'::text) $$,
  'V-DB-67d: 同じリレー内のメンバーの氏名はちゃんと返る (母集団の拘束が過剰に閉じていない)');

-- 承認待ち / 非アクティブなメンバーの氏名は**残る** (所属条件に status/is_active を
-- 含めていないことの実証)。含めると退会者の名前が過去の記録から消える。
select results_eq(
  $$ select leg->>'displayName'
     from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) r,
       jsonb_array_elements(r.legs) as leg
     where r.total_time = 210.00
     order by (leg->>'legIndex')::int $$,
  $$ values ('QA_RELAY_ADMIN'::text), ('QA_RELAY_MEMBER'::text),
            ('QA_RELAY_PENDING'::text), ('QA_RELAY_INACTIVE'::text) $$,
  'V-DB-67e: 承認待ち・非アクティブ (退会済み) メンバーの氏名も残る (述語は「行が存在するか」だけ)');

-- =============================================================================
-- V-DB-68: p_limit のクランプ (例外にしない)
-- =============================================================================
select is(
  (select count(*)::int from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint,
     null, null, false, 0)),
  1,
  'V-DB-68a: p_limit=0 は 1 にクランプされる (0 件にも例外にもならない)');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint,
     null, null, false, -7)),
  1,
  'V-DB-68b: 負数の p_limit も 1 にクランプされる');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint,
     null, null, false, null)),
  4,
  'V-DB-68c: p_limit=NULL は既定 50 として扱われる (該当 4 件が全部返る)');

select lives_ok(
  $$ select * from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint,
       null, null, false, 99999) $$,
  'V-DB-68d: p_limit=99999 は 500 にクランプされる (例外にならない)');

-- =============================================================================
-- V-DB-69: legs (JSONB)
-- =============================================================================
-- ⚠️ 挿入順を 4,1,6,0,3,5,2 とシャッフルした 7 レグ。
--    jsonb_agg に ORDER BY が無い実装なら物理順が漏れてここで崩れる。
select is(
  (select array_agg((leg->>'legIndex')::int order by ord)
   from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 25, 1::smallint) r,
     jsonb_array_elements(r.legs) with ordinality as t(leg, ord)),
  ARRAY[0, 1, 2, 3, 4, 5, 6],
  'V-DB-69a: legs は leg_index の昇順 (挿入順 4,1,6,0,3,5,2 が漏れていない)');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 25, 1::smallint) r,
     jsonb_array_elements(r.legs) as leg),
  7,
  'V-DB-69b: leg_count=7 のリレーはレグ 7 件すべてを返す (4 件で切らない)');

select is(
  (select array_agg(distinct k order by k)
   from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) r,
     jsonb_array_elements(r.legs) as leg,
     jsonb_object_keys(leg) as k),
  ARRAY['displayName', 'legId', 'legIndex', 'legTime',
        'reactionTime', 'style', 'styleId', 'userId']::text[],
  'V-DB-69c: legs のキーは 8 個の allowlist だけ (通算タイムのキーが無い = DB に二重保存していない)');

-- 🚨 ユーザー依頼でプロフィール画像を出さない方針になり、`avatarPath` を
--    jsonb_build_object から削除した。**`->>` は無いキーにも NULL を返す**ので
--    「NULL であること」では検出できない。`?` 演算子で**キーの不在**を見る。
select ok(
  (select bool_and(NOT (leg ? 'avatarPath'))
   from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) r,
     jsonb_array_elements(r.legs) as leg),
  'V-DB-69i: legs に avatarPath キーが**存在しない** (取得していない列を返していない)');

-- 関数定義そのものにも `avatarPath` / `profile_image_path` が残っていないこと。
-- 行が0件のときに上の assert が空振りしないための二重化でもある。
--
-- ⚠️ `pg_get_functiondef` は **関数本体の SQL コメントも含む**。この RPC は
--    「なぜ profile_image_path を落としたのに users の JOIN を残すのか」を
--    コメントで説明しているので、素朴に正規表現を当てると必ず赤くなる
--    (QA が実際に踏んだ)。`--` 行を落としてから当てる。
select ok(
  (select NOT bool_or(line ~ 'avatarPath|profile_image_path')
   from (
     select unnest(string_to_array(pg_get_functiondef(p.oid), E'\n')) as line
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'get_team_relay_rankings'
   ) t
   where btrim(line) NOT LIKE '--%'),
  'V-DB-69j: 関数の**コード部分**に avatarPath / profile_image_path が現れない (コメントでの言及は許容)');

-- ⚠️ ただし users への LEFT JOIN と所属 EXISTS は **displayName のために必須**。
--    アバターを消したついでに JOIN を落とすと、非メンバーの本名が露出する
--    C-2 の防御線が消える (13_relay_records_authz_and_fk.test.sql と対)。
select ok(
  (select pg_get_functiondef(p.oid) ~ 'LEFT JOIN public\.users u'
     AND pg_get_functiondef(p.oid) ~ 'team_memberships tm_leg'
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_team_relay_rankings'),
  'V-DB-69k: users の LEFT JOIN と所属 EXISTS は残っている (displayName のために必須。C-2 の防御線)');

-- 区間タイムであること。通算 [51.20, 104.30, 157.05, 210.00] が入っていたら退行。
select is(
  (select array_agg((leg->>'legTime')::numeric order by (leg->>'legIndex')::int)
   from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) r,
     jsonb_array_elements(r.legs) as leg
   where r.total_time = 210.00),
  ARRAY[51.20, 53.10, 52.75, 52.95]::numeric[],
  'V-DB-69d: legTime は**区間タイム**である (通算 51.20/104.30/157.05/210.00 ではない)');

-- 退会した泳者。ここで実際に auth.users から削除して ON DELETE SET NULL を発火させる。
select public.qa_relay_logout();
delete from auth.users where id = '44440000-0000-4000-a000-000000000006';
select public.qa_relay_login_as('44440000-0000-4000-a000-000000000002');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 50, 1::smallint) r,
     jsonb_array_elements(r.legs) as leg
   where r.total_time = 140.00),
  4,
  'V-DB-69e: 泳者が退会してもレグ 4 件が欠けない (行が消えると通算が壊れる)');

select results_eq(
  $$ select leg->>'userId', leg->>'displayName'
     from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 50, 1::smallint) r,
       jsonb_array_elements(r.legs) as leg
     where r.total_time = 140.00 and (leg->>'legIndex')::int = 0 $$,
  $$ values (null::text, null::text) $$,
  'V-DB-69f: 退会した泳者のレグは userId / displayName が NULL になる (行は残る)');

select is(
  (select legs from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 50, 1::smallint)
   where total_time = 130.00),
  '[]'::jsonb,
  'V-DB-69g: レグが 0 件のリレー記録も行として返る (legs は空配列。行を落とさない)');

-- text 順と数値順が食い違う機構そのもの。
-- ⚠️ 現在の relay_record_legs は CHECK (leg_index < 8) なので 2 桁の leg_index は
--    存在し得ない = この食い違いは今の DB では発現しない。将来 leg_count の上限を
--    広げたときに初めて効く保険であることをここで明示しておく
--    (「実証できないから直さない」ではなく「効く条件を書き残す」)。
select isnt(
  (select array_agg(v order by v::text) from (values (2), (10)) s(v)),
  (select array_agg(v order by v) from (values (2), (10)) s(v)),
  'V-DB-69h: text 順 ("10" < "2") と数値順 (2 < 10) は食い違う。ORDER BY を text にすると 2 桁 leg_index で崩れる');

-- =============================================================================
-- V-DB-70: users の機微列が返らない (実データで確認する)
--
-- fixture は 6 人全員の bio / google_calendar_refresh_token に
-- 'QA_RELAY_HIDDEN_...' を入れてある。RPC は users を LEFT JOIN するので、
-- 列の allowlist が崩れればこの文字列が返り値に現れる。
-- =============================================================================
select is(
  (select count(*)::int from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) r
   where r::text like '%QA_RELAY_HIDDEN%'),
  0,
  'V-DB-70a: bio / refresh_token の秘密文字列が返り値のどの列にも現れない');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) r,
     jsonb_array_elements(r.legs) as leg
   where leg::text like '%QA_RELAY_HIDDEN%'),
  0,
  'V-DB-70b: legs の JSONB にも機微列が混ざらない (泳者名とアバターパスだけ)');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint) r
   where r.total_time = 210.00),
  1,
  'V-DB-70c: 対象の行そのものは (機微列を伏せたうえで) ちゃんと返っている');

-- =============================================================================
-- V-DB-71: RLS の書き込み / 非メンバーの素の SELECT
-- =============================================================================
-- 承認済み**非管理者** (r_member) でログイン中
select throws_ok(
  $$ insert into public.relay_records
       (team_id, competition_id, relay_kind, leg_distance, leg_count, pool_type,
        gender_category, total_time)
     values ('55550000-0000-4000-a000-00000000000a'::uuid, null, 'free', 100, 4, 1,
             'male', 260.00) $$,
  '42501', null,
  'V-DB-71a: 非管理者の INSERT は RLS で拒否される (閲覧はできるが書けない)');

select throws_ok(
  $$ insert into public.relay_record_legs
       (relay_record_id, leg_index, user_id, style_id, leg_time)
     values ('77770000-0000-4000-a000-000000000009'::uuid, 0,
             '44440000-0000-4000-a000-000000000002'::uuid, 3, 30.00) $$,
  '42501', null,
  'V-DB-71b: 非管理者の relay_record_legs への INSERT も RLS で拒否される');

-- 🚨 TRUNCATE は RLS を通らない。GRANT で剥がしていなければここが通ってしまう。
select throws_ok(
  $$ truncate table public.relay_record_legs, public.relay_records $$,
  '42501', null,
  'V-DB-71c: authenticated の TRUNCATE は権限層で拒否される (RLS だけでは防げない経路)');

select public.qa_relay_logout();
select public.qa_relay_login_as('44440000-0000-4000-a000-000000000005');

select is(
  (select count(*)::int from public.relay_records
   where team_id = '55550000-0000-4000-a000-00000000000a'),
  0,
  'V-DB-71d: 非メンバーの素の SELECT は 0 行 (RPC を通さない経路も RLS で閉じている)');

select public.qa_relay_logout();
select public.qa_relay_login_as('44440000-0000-4000-a000-000000000001');

select lives_ok(
  $$ insert into public.relay_records
       (team_id, competition_id, relay_kind, leg_distance, leg_count, pool_type,
        gender_category, total_time)
     values ('55550000-0000-4000-a000-00000000000a'::uuid, null, 'free', 100, 4, 1,
             'male', 270.00) $$,
  'V-DB-71e: 管理者の INSERT は通る (RLS が過剰に閉じていない)');

select is(
  (select created_by from public.relay_records where total_time = 270.00),
  '44440000-0000-4000-a000-000000000001'::uuid,
  'V-DB-71f: created_by を送らなくても DB DEFAULT auth.uid() が JWT の subject を入れる');

delete from public.relay_records where total_time = 270.00;

select public.qa_relay_logout();
select public.qa_relay_login_as('44440000-0000-4000-a000-000000000002');

-- =============================================================================
-- V-DB-72: 並び順と同着のタイブレーク / 年度
-- =============================================================================
select results_eq(
  $$ select competition_title from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 400, 1::smallint) $$,
  $$ values ('QA Relay MeetPrimary'::text), ('QA Relay MeetLater'::text), (null::text) $$,
  'V-DB-72a: 同着 300.00 は大会日 ASC NULLS LAST でタイブレークされる (大会なしが最後)');

select ok(
  (select bool_and(prev is null or prev <= cur)
   from (
     select total_time as cur, lag(total_time) over (order by ord) as prev
     from (
       select total_time, row_number() over () as ord
       from public.get_team_relay_rankings(
         '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint)
     ) t
   ) u),
  'V-DB-72b: 返り値は総合タイム昇順 (クライアント側の順位付与がこの並びを前提にしている)');

select results_eq(
  $$ select total_time from public.get_team_relay_rankings(
       '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint,
       null, 2026) $$,
  $$ values (210.00::numeric), (213.55::numeric) $$,
  'V-DB-72c: 年度 2026 (2026-04-01〜2027-03-31) は 2027-08-09 の 217.00 を除外する');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     '55550000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint,
     null, 2026)
   where total_time = 219.07),
  0,
  'V-DB-72d: 年度指定時は大会に紐づかない行 (219.07) が除外される (年度が決まらないため)');

select public.qa_relay_logout();

select * from finish();
rollback;
