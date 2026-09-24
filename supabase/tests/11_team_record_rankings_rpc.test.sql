-- =============================================================================
-- pgTAP: get_team_record_rankings RPC の実DB検証 (QA Sprint Contract Phase B)
--
-- 対象 migration: 20260907000000_team_record_rankings_rpc.sql
--
-- なぜ実 DB で検証するか:
--   この RPC は SECURITY DEFINER で records / users の RLS をバイパスする。
--   「誰が呼べるか」「どの行が集計されるか」「どの列を返すか」の3つが防御線であり、
--   どれも Supabase クライアントのモックでは検証できない (モックは自分が書いた
--   述語をそのまま返すだけなのでトートロジーになる)。
--
-- 観点:
--   V-DB-40: styles マスターのグラウンドトゥルース。25m×4種目 と 1500mFr が実在する
--            (apps/shared/__tests__/utils/rankingStyleAxis.test.ts の fixture の裏付け)
--   V-DB-41: 関数のセキュリティ属性と実行権限 (SECURITY DEFINER / STABLE /
--            search_path 固定 / anon 実行不可 / authenticated と service_role のみ可)
--   V-DB-42: 返す列がランキング表示に必要な14列だけであること。
--            note / video_path / video_thumbnail_path / reaction_time /
--            birthday / bio / google_calendar_refresh_token を返さない
--   V-DB-43: 認可ガード。未認証 / 非メンバー / 承認待ち / 非アクティブは例外。
--            承認済みかつアクティブなメンバーだけが呼べる
--            (PM 裁定 V-32a: 承認待ちには閲覧させない)
--   V-DB-44: 未知の scope / aggregation は「全件返す」等の危険な既定に落とさず例外。
--            NULL は三値論理でガードを素通りするため `IS NULL` で先に弾く
--            (p_scope/p_aggregation/p_style_id/p_pool_type)。一方
--            p_gender / p_fiscal_year / p_limit の NULL は意味のある NULL なので通す
--   V-DB-45: スコープの中核。teamCompetitions は competitions.team_id で絞り、
--            records.team_id では絞らない (web 由来の team_id NULL 行を落とさない/
--            他チーム大会に付いた records.team_id を信用しない)。
--            リレーのレグ・一括登録記録・承認待ち・非アクティブ・非メンバーの扱い
--   V-DB-46: 性別フィルタ (NULL = 男女すべて、0/1 = 絞り込み)
--   V-DB-47: 集計モード (personalBest = 1メンバー1行 / allRaces = 全レース)
--   V-DB-48: 年度 (日本の年度 4/1〜翌3/31)。判定は competitions.date で行い
--            records.created_at を使わない。境界日を含む
--   V-DB-49: p_limit のクランプ (0 / 負数 / NULL / 巨大値でも例外にしない)
--   V-DB-50: 種目・水路の厳密一致。CHECK 制約が無い異常な pool_type は
--            どちらの水路のランキングにも混ざらない
--   V-DB-51: 並び順が time 昇順で、同着時のタイブレークが決定的
--            (大会日 ASC NULLS LAST → record_id)
--
-- 実行: ローカル Supabase 起動済み + migration 適用済みで `supabase test db`。
--       全フィクスチャは rollback で消える。
--
-- ⚠️ フィクスチャ作成上の注意 (実際に踏んだ罠):
--   - auth.users への INSERT は on_auth_user_created トリガーが public.users を
--     自動生成する。public.users へ直接 INSERT すると PK 重複になる。
--     name / gender は raw_user_meta_data 経由で渡し、それ以外は UPDATE で調整する。
--   - public.teams の作成者列は created_by (user_id ではない)。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(66);

-- -----------------------------------------------------------------------------
-- ヘルパー: JWT クレーム + ロール切替 (01/04/10 の各テストと同型)
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

-- =============================================================================
-- V-DB-40: styles マスターのグラウンドトゥルース
--   ユニットテスト (rankingStyleAxis.test.ts) の fixture はこの実データを転記した
--   ものなので、実 DB 側が変わったらこちらが先に赤くなる。
-- =============================================================================
select is(
  (select count(*)::int from public.styles),
  22,
  'V-DB-40a: styles マスターは 22 行 (ランキングの種目/距離軸の母集団)');

select results_eq(
  $$ select distance from public.styles where style = 'Fr' order by distance $$,
  $$ values (25), (50), (100), (200), (400), (800), (1500) $$,
  'V-DB-40b: 自由形の距離は 25m と 1500m を含む 7 件 (静的リスト [50..800] では足りない)');

select is(
  (select count(distinct style)::int from public.styles where distance = 25),
  4,
  'V-DB-40c: 25m の行を持つ種目はちょうど 4 種目 (個人メドレーには無い)');

select results_eq(
  $$ select style, id from public.styles where distance = 1500 order by id $$,
  $$ values ('Fr'::text, 7) $$,
  'V-DB-40d: 1500m は自由形のみ (styles.id = 7)');

-- =============================================================================
-- V-DB-41: セキュリティ属性と実行権限
-- =============================================================================
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_team_record_rankings'),
  true,
  'V-DB-41a: SECURITY DEFINER である (RLS をバイパスして横断集計するため)');

select is(
  (select provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_team_record_rankings'),
  's'::"char",
  'V-DB-41b: STABLE である (書き込みを行わない読み取り専用の関数)');

select ok(
  (select 'search_path=public' = any(proconfig)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_team_record_rankings'),
  'V-DB-41c: search_path が public に固定されている (SECURITY DEFINER の必須対策)');

select ok(
  not has_function_privilege('anon',
    -- ⚠️ シグネチャは migration 20260909000000 で `p_fiscal_year_or_earlier boolean`
    --    が増えた (「2023年度以前」が単一整数では表現できないため)。
    --    旧シグネチャは DROP されているので、ここを更新しないと
    --    `function ... does not exist` でファイル全体が Bad plan になる
    --    (実測: planned 66 ran 7)。同名関数が1つだけであることは
    --    `14_fiscal_year_boundary.test.sql` の V-DB-85 が担保する。
    'public.get_team_record_rankings(uuid, text, integer, smallint, smallint, text, integer, boolean, integer)',
    'EXECUTE'),
  'V-DB-41d: anon は EXECUTE できない (REVOKE 済み)');

select ok(
  has_function_privilege('authenticated',
    'public.get_team_record_rankings(uuid, text, integer, smallint, smallint, text, integer, boolean, integer)',
    'EXECUTE'),
  'V-DB-41e: authenticated は EXECUTE できる');

select ok(
  has_function_privilege('service_role',
    'public.get_team_record_rankings(uuid, text, integer, smallint, smallint, text, integer, boolean, integer)',
    'EXECUTE'),
  'V-DB-41f: service_role は EXECUTE できる');

-- =============================================================================
-- V-DB-42: 返す列が13列だけであること (情報露出の防御線)
--
-- ユーザー依頼でランキング表にプロフィール画像を出さない方針になり、
-- `avatar_path` を RETURNS TABLE から削除した (14 → 13列)。
-- 「取得しているが誰も読まない列」を残さないため
-- (CREATE OR REPLACE は戻り値型を変えられないので migration 先頭に
--  DROP FUNCTION IF EXISTS が入っている)。
-- =============================================================================
-- results_eq は refcursor 同士の record 比較で unnest(text[]) 由来の列の
-- collation を決められずエラーになるため、配列に畳んで is() で比較する。
select is(
  (select array_agg(a.name::text order by a.ord)
   from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace,
     unnest(p.proargnames, p.proargmodes) with ordinality as a(name, mode, ord)
   where n.nspname = 'public'
     and p.proname = 'get_team_record_rankings'
     and a.mode = 't'),
  ARRAY['record_id', 'user_id', 'display_name', 'time',
        'style_id', 'style', 'distance', 'pool_type', 'gender',
        'competition_id', 'competition_title', 'competition_date', 'record_created_at']::text[],
  'V-DB-42a: RETURNS TABLE の列はランキング表示に必要な13列のみ (順序も固定)');

select is(
  (select count(*)::int
   from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace,
     unnest(p.proargnames, p.proargmodes) as a(name, mode)
   where n.nspname = 'public'
     and p.proname = 'get_team_record_rankings'
     and a.mode = 't'
     -- `avatar_path` / `profile_image_path` を deny 側に足すのが 42a と対称。
     -- 42a の厳密一致でも検出できるが、「意図して落とした列」であることを
     -- ここに明示しておくと、42a を更新するときに理由が読める
     and a.name in ('note', 'video_path', 'video_thumbnail_path', 'reaction_time',
                    'birthday', 'bio', 'google_calendar_refresh_token',
                    'avatar_path', 'profile_image_path')),
  0,
  'V-DB-42b: 非公開前提・不使用の列 (メモ/動画/リアクションタイム/誕生日/自己紹介/refresh_token/アバター) を返さない');

-- 関数の**コード部分**にも profile_image_path が残っていないこと。
-- ⚠️ `pg_get_functiondef` は SQL コメントも含むので `--` 行を落としてから当てる
--    (12_ 側で同じ罠を踏んだ)。
select ok(
  (select NOT bool_or(line ~ 'avatar_path|profile_image_path')
   from (
     select unnest(string_to_array(pg_get_functiondef(p.oid), E'\n')) as line
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'get_team_record_rankings'
   ) t
   where btrim(line) NOT LIKE '--%'),
  'V-DB-42c: 関数のコード部分に avatar_path / profile_image_path が現れない (users から不要な列を読んでいない)');

-- =============================================================================
-- フィクスチャ
--
-- チーム: team_alpha (検証対象) / team_bravo (他チーム)
--
-- メンバー (すべて team_alpha に対する状態):
--   u_web      承認済み・アクティブ・gender 0 … web 由来の記録 (records.team_id NULL)
--   u_mobile   承認済み・アクティブ・gender 1 … mobile 由来の記録 (records.team_id 有り)
--   u_polluted 承認済み・アクティブ・gender 0 … 他チーム大会の記録に team_alpha が
--                                               付いてしまった「汚染行」の持ち主
--   u_bulk     承認済み・アクティブ・gender 1 … 一括登録 (competition_id NULL) の記録
--   u_relay    承認済み・アクティブ・gender 0 … リレーのレグのみを持つ (最速)
--   u_pending  **承認待ち**         ・gender 1 … 集計にも閲覧にも入ってはいけない
--   u_left     承認済みだが is_active=false・gender 0 … 退会済み。集計に入らない
--   u_outside  team_alpha の非メンバー・gender 1 … 集計に入らない
--   u_dual     team_alpha と team_bravo の両方に所属・gender 0 … 掛け持ち
--
-- 名前は期待値 (タイム/件数) の部分文字列にならない語を使う。
-- =============================================================================
insert into auth.users (id, email, raw_user_meta_data) values
  ('11110000-0000-4000-a000-000000000001', 'qa-rank-web@example.test',      '{"name":"QA_WEB","gender":0}'),
  ('11110000-0000-4000-a000-000000000002', 'qa-rank-mobile@example.test',   '{"name":"QA_MOBILE","gender":1}'),
  ('11110000-0000-4000-a000-000000000003', 'qa-rank-polluted@example.test', '{"name":"QA_POLLUTED","gender":0}'),
  ('11110000-0000-4000-a000-000000000004', 'qa-rank-bulk@example.test',     '{"name":"QA_BULK","gender":1}'),
  ('11110000-0000-4000-a000-000000000005', 'qa-rank-relay@example.test',    '{"name":"QA_RELAY","gender":0}'),
  ('11110000-0000-4000-a000-000000000006', 'qa-rank-pending@example.test',  '{"name":"QA_PENDING","gender":1}'),
  ('11110000-0000-4000-a000-000000000007', 'qa-rank-left@example.test',     '{"name":"QA_LEFT","gender":0}'),
  ('11110000-0000-4000-a000-000000000008', 'qa-rank-outside@example.test',  '{"name":"QA_OUTSIDE","gender":1}'),
  ('11110000-0000-4000-a000-000000000009', 'qa-rank-dual@example.test',     '{"name":"QA_DUAL","gender":0}');

-- public.users はトリガーが自動生成済み。露出してはいけない列を埋めて
-- 「返らないこと」に意味を持たせる (V-DB-42 の裏付け)
update public.users
set profile_image_path = id::text || '/avatar.webp',
    birthday = '2001-02-03',
    bio = 'QA_SECRET_BIO',
    google_calendar_refresh_token = 'QA_SECRET_TOKEN'
where id in (
  '11110000-0000-4000-a000-000000000001','11110000-0000-4000-a000-000000000002',
  '11110000-0000-4000-a000-000000000003','11110000-0000-4000-a000-000000000004',
  '11110000-0000-4000-a000-000000000005','11110000-0000-4000-a000-000000000006',
  '11110000-0000-4000-a000-000000000007','11110000-0000-4000-a000-000000000008',
  '11110000-0000-4000-a000-000000000009');

insert into public.teams (id, name, invite_code, created_by) values
  ('22220000-0000-4000-a000-00000000000a', 'QA Rank TeamAlpha', 'QA-RANK-ALPHA',
   '11110000-0000-4000-a000-000000000001'),
  ('22220000-0000-4000-a000-00000000000b', 'QA Rank TeamBravo', 'QA-RANK-BRAVO',
   '11110000-0000-4000-a000-000000000008');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at) values
  ('22220000-0000-4000-a000-00000000000a', '11110000-0000-4000-a000-000000000001', 'admin', 'approved', true,  '2026-01-01'),
  ('22220000-0000-4000-a000-00000000000a', '11110000-0000-4000-a000-000000000002', 'user',  'approved', true,  '2026-01-01'),
  ('22220000-0000-4000-a000-00000000000a', '11110000-0000-4000-a000-000000000003', 'user',  'approved', true,  '2026-01-01'),
  ('22220000-0000-4000-a000-00000000000a', '11110000-0000-4000-a000-000000000004', 'user',  'approved', true,  '2026-01-01'),
  ('22220000-0000-4000-a000-00000000000a', '11110000-0000-4000-a000-000000000005', 'user',  'approved', true,  '2026-01-01'),
  ('22220000-0000-4000-a000-00000000000a', '11110000-0000-4000-a000-000000000006', 'user',  'pending',  true,  '2026-01-01'),
  ('22220000-0000-4000-a000-00000000000a', '11110000-0000-4000-a000-000000000007', 'user',  'approved', false, '2026-01-01'),
  ('22220000-0000-4000-a000-00000000000a', '11110000-0000-4000-a000-000000000009', 'user',  'approved', true,  '2026-01-01'),
  ('22220000-0000-4000-a000-00000000000b', '11110000-0000-4000-a000-000000000008', 'admin', 'approved', true,  '2026-01-01'),
  ('22220000-0000-4000-a000-00000000000b', '11110000-0000-4000-a000-000000000009', 'user',  'approved', true,  '2026-01-01');

-- 大会
--   comp_alpha      team_alpha の大会 (2026-05-03 = 2026年度)
--   comp_bravo      team_bravo の大会 (2026-06-07)
--   comp_fy_start   team_alpha / 2026-04-01 = 2026年度の開始境界
--   comp_fy_end     team_alpha / 2027-03-31 = 2026年度の終了境界
--   comp_fy_after   team_alpha / 2027-04-01 = 2027年度 (境界の外)
--   comp_fy_before  team_alpha / 2025-03-15 = 2024年度
insert into public.competitions (id, user_id, team_id, title, date, pool_type) values
  ('33330000-0000-4000-a000-000000000001', '11110000-0000-4000-a000-000000000001',
   '22220000-0000-4000-a000-00000000000a', 'QA Rank CompAlpha',  '2026-05-03', 0),
  ('33330000-0000-4000-a000-000000000002', '11110000-0000-4000-a000-000000000008',
   '22220000-0000-4000-a000-00000000000b', 'QA Rank CompBravo',  '2026-06-07', 0),
  ('33330000-0000-4000-a000-000000000003', '11110000-0000-4000-a000-000000000001',
   '22220000-0000-4000-a000-00000000000a', 'QA Rank FyStart',    '2026-04-01', 0),
  ('33330000-0000-4000-a000-000000000004', '11110000-0000-4000-a000-000000000001',
   '22220000-0000-4000-a000-00000000000a', 'QA Rank FyEnd',      '2027-03-31', 0),
  ('33330000-0000-4000-a000-000000000005', '11110000-0000-4000-a000-000000000001',
   '22220000-0000-4000-a000-00000000000a', 'QA Rank FyAfter',    '2027-04-01', 0),
  ('33330000-0000-4000-a000-000000000006', '11110000-0000-4000-a000-000000000001',
   '22220000-0000-4000-a000-00000000000a', 'QA Rank FyBefore',   '2025-03-15', 0);

-- ---------------------------------------------------------------------------
-- スコープ検証用の記録 (style_id = 2 = 50m 自由形 / pool_type = 0)
--   1メンバー1行になるよう別メンバーに割り当てているので、personalBest でも
--   「含まれた/除外された」が行数と タイム集合にそのまま現れる。
--
--   30.00  u_web      comp_alpha / records.team_id NULL   → teamCompetitions に含まれる
--   31.00  u_mobile   comp_alpha / records.team_id alpha  → teamCompetitions に含まれる
--   33.00  u_dual     comp_alpha / records.team_id NULL   → teamCompetitions に含まれる
--   32.00  u_dual     comp_bravo / records.team_id bravo  → allCompetitions のみ
--                     (掛け持ちメンバーの他チーム大会。32.00 < 33.00 なので
--                      「スコープで絞ってから最速を選ぶ」順序も検証できる)
--   29.00  u_polluted comp_bravo / records.team_id alpha  → **汚染行**。
--                     records.team_id で絞る実装だと teamCompetitions に混入する
--   28.50  u_bulk     competition_id NULL                → allCompetitions のみ
--   27.00  u_relay    comp_alpha / is_relaying = true     → どちらのスコープにも出ない
--   26.00  u_pending  comp_alpha                          → 承認待ちなので集計外
--   25.00  u_left     comp_alpha                          → 非アクティブなので集計外
--   24.00  u_outside  comp_alpha                          → 非メンバーなので集計外
--   20.00  u_web      comp_alpha / pool_type = 5          → 異常値。どの水路にも出ない
-- ---------------------------------------------------------------------------
insert into public.records
  (id, user_id, competition_id, team_id, style_id, "time", pool_type, is_relaying, note, video_path, reaction_time)
values
  ('44440000-0000-4000-a000-000000000030', '11110000-0000-4000-a000-000000000001',
   '33330000-0000-4000-a000-000000000001', null,
   2, 30.00, 0, false, 'QA_SECRET_NOTE', 'QA_SECRET_VIDEO.mp4', 0.71),
  ('44440000-0000-4000-a000-000000000031', '11110000-0000-4000-a000-000000000002',
   '33330000-0000-4000-a000-000000000001', '22220000-0000-4000-a000-00000000000a',
   2, 31.00, 0, false, 'QA_SECRET_NOTE', null, null),
  ('44440000-0000-4000-a000-000000000033', '11110000-0000-4000-a000-000000000009',
   '33330000-0000-4000-a000-000000000001', null,
   2, 33.00, 0, false, null, null, null),
  ('44440000-0000-4000-a000-000000000032', '11110000-0000-4000-a000-000000000009',
   '33330000-0000-4000-a000-000000000002', '22220000-0000-4000-a000-00000000000b',
   2, 32.00, 0, false, null, null, null),
  ('44440000-0000-4000-a000-000000000029', '11110000-0000-4000-a000-000000000003',
   '33330000-0000-4000-a000-000000000002', '22220000-0000-4000-a000-00000000000a',
   2, 29.00, 0, false, null, null, null),
  ('44440000-0000-4000-a000-000000000285', '11110000-0000-4000-a000-000000000004',
   null, null,
   2, 28.50, 0, false, null, null, null),
  ('44440000-0000-4000-a000-000000000027', '11110000-0000-4000-a000-000000000005',
   '33330000-0000-4000-a000-000000000001', '22220000-0000-4000-a000-00000000000a',
   2, 27.00, 0, true, null, null, null),
  ('44440000-0000-4000-a000-000000000026', '11110000-0000-4000-a000-000000000006',
   '33330000-0000-4000-a000-000000000001', '22220000-0000-4000-a000-00000000000a',
   2, 26.00, 0, false, null, null, null),
  ('44440000-0000-4000-a000-000000000025', '11110000-0000-4000-a000-000000000007',
   '33330000-0000-4000-a000-000000000001', '22220000-0000-4000-a000-00000000000a',
   2, 25.00, 0, false, null, null, null),
  ('44440000-0000-4000-a000-000000000024', '11110000-0000-4000-a000-000000000008',
   '33330000-0000-4000-a000-000000000001', null,
   2, 24.00, 0, false, null, null, null),
  ('44440000-0000-4000-a000-000000000020', '11110000-0000-4000-a000-000000000001',
   '33330000-0000-4000-a000-000000000001', null,
   2, 20.00, 5, false, null, null, null);

-- 100m 自由形 (style_id = 3) に 1 件だけ置き、種目の厳密一致を検証する
insert into public.records (id, user_id, competition_id, style_id, "time", pool_type, is_relaying)
values
  ('44440000-0000-4000-a000-000000000103', '11110000-0000-4000-a000-000000000001',
   '33330000-0000-4000-a000-000000000001', 3, 70.00, 0, false);

-- 50m 自由形 / 長水路 (pool_type = 1) に 1 件だけ置き、水路の厳密一致を検証する
insert into public.records (id, user_id, competition_id, style_id, "time", pool_type, is_relaying)
values
  ('44440000-0000-4000-a000-000000000201', '11110000-0000-4000-a000-000000000002',
   '33330000-0000-4000-a000-000000000001', 2, 26.50, 1, false);

-- ---------------------------------------------------------------------------
-- 集計モード検証用 (style_id = 9 = 50m 平泳ぎ / pool_type = 0)
--   u_web が 3 レース (40.00 / 38.00 / 39.00)、u_mobile が 1 レース (37.00)。
--   personalBest → 2 行 (37.00, 38.00) / allRaces → 4 行
-- ---------------------------------------------------------------------------
insert into public.records (id, user_id, competition_id, style_id, "time", pool_type, is_relaying)
values
  ('44440000-0000-4000-a000-000000000940', '11110000-0000-4000-a000-000000000001',
   '33330000-0000-4000-a000-000000000001', 9, 40.00, 0, false),
  ('44440000-0000-4000-a000-000000000938', '11110000-0000-4000-a000-000000000001',
   '33330000-0000-4000-a000-000000000003', 9, 38.00, 0, false),
  ('44440000-0000-4000-a000-000000000939', '11110000-0000-4000-a000-000000000001',
   '33330000-0000-4000-a000-000000000004', 9, 39.00, 0, false),
  ('44440000-0000-4000-a000-000000000937', '11110000-0000-4000-a000-000000000002',
   '33330000-0000-4000-a000-000000000001', 9, 37.00, 0, false);

-- ---------------------------------------------------------------------------
-- 年度検証用 (style_id = 13 = 50m 背泳ぎ / pool_type = 0)
--   50.00 u_web      comp_fy_before (2025-03-15) → 2024年度
--   51.00 u_mobile   comp_fy_start  (2026-04-01) → 2026年度の開始境界
--   52.00 u_polluted comp_fy_end    (2027-03-31) → 2026年度の終了境界
--   53.00 u_bulk     comp_fy_after  (2027-04-01) → 2027年度 (境界の外)
--   54.00 u_relay    competition_id NULL         → 年度が決まらない
-- ---------------------------------------------------------------------------
insert into public.records (id, user_id, competition_id, style_id, "time", pool_type, is_relaying)
values
  ('44440000-0000-4000-a000-000000001350', '11110000-0000-4000-a000-000000000001',
   '33330000-0000-4000-a000-000000000006', 13, 50.00, 0, false),
  ('44440000-0000-4000-a000-000000001351', '11110000-0000-4000-a000-000000000002',
   '33330000-0000-4000-a000-000000000003', 13, 51.00, 0, false),
  ('44440000-0000-4000-a000-000000001352', '11110000-0000-4000-a000-000000000003',
   '33330000-0000-4000-a000-000000000004', 13, 52.00, 0, false),
  ('44440000-0000-4000-a000-000000001353', '11110000-0000-4000-a000-000000000004',
   '33330000-0000-4000-a000-000000000005', 13, 53.00, 0, false),
  ('44440000-0000-4000-a000-000000001354', '11110000-0000-4000-a000-000000000005',
   null, 13, 54.00, 0, false);

-- ---------------------------------------------------------------------------
-- 同着のタイブレーク検証用 (style_id = 21 = 200m 個人メドレー / pool_type = 0)
--   45.00 × 3件。大会日は 2026-04-01 / 2026-05-03 / NULL。
--   ORDER BY time, competition_date ASC NULLS LAST, record_id なので
--   allCompetitions では FyStart → CompAlpha → (大会なし) の順になるはず。
-- ---------------------------------------------------------------------------
insert into public.records (id, user_id, competition_id, style_id, "time", pool_type, is_relaying)
values
  ('44440000-0000-4000-a000-000000002101', '11110000-0000-4000-a000-000000000002',
   '33330000-0000-4000-a000-000000000003', 21, 45.00, 0, false),
  ('44440000-0000-4000-a000-000000002102', '11110000-0000-4000-a000-000000000001',
   '33330000-0000-4000-a000-000000000001', 21, 45.00, 0, false),
  ('44440000-0000-4000-a000-000000002103', '11110000-0000-4000-a000-000000000003',
   null, 21, 45.00, 0, false);

-- =============================================================================
-- V-DB-43: 認可ガード
-- =============================================================================
-- anon: GRANT 層で EXECUTE 自体が拒否される
select public.qa_login_anon();

select throws_ok(
  $$ select * from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint) $$,
  '42501', null,
  'V-DB-43a: anon が直接呼ぶと GRANT 層で拒否される');

select public.qa_logout();

-- authenticated だが JWT 無し (auth.uid() IS NULL)
select set_config('request.jwt.claims', '', true);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$ select * from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint) $$,
  'P0001', null,
  'V-DB-43b: auth.uid() が NULL のとき関数内ガードが例外にする');

select public.qa_logout();

-- 非メンバー (team_alpha に所属していない u_outside)
select public.qa_login_as('11110000-0000-4000-a000-000000000008');

select throws_ok(
  $$ select * from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint) $$,
  'P0001', null,
  'V-DB-43c: 非メンバーは例外 (他チームのタイムを覗けない)');

select public.qa_logout();

-- 承認待ちメンバー (PM 裁定 V-32a: 閲覧させない)
select public.qa_login_as('11110000-0000-4000-a000-000000000006');

select throws_ok(
  $$ select * from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint) $$,
  'P0001', null,
  'V-DB-43d: 承認待ち (status=pending) は例外。is_team_member 相当の is_active だけの判定では通ってしまう');

select public.qa_logout();

-- 退会済み (approved だが is_active = false)
select public.qa_login_as('11110000-0000-4000-a000-000000000007');

select throws_ok(
  $$ select * from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint) $$,
  'P0001', null,
  'V-DB-43e: 非アクティブ (is_active=false) は例外');

select public.qa_logout();

-- 承認済みかつアクティブなメンバーは呼べる
select public.qa_login_as('11110000-0000-4000-a000-000000000002');

select lives_ok(
  $$ select * from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint) $$,
  'V-DB-43f: 承認済みかつアクティブな一般メンバーは呼べる (管理者限定ではない)');

-- =============================================================================
-- V-DB-44: 入力値ガード (以降は u_mobile でログインしたまま実行)
-- =============================================================================
select throws_ok(
  $$ select * from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'allTeams', 2, 0::smallint) $$,
  'P0001', null,
  'V-DB-44a: 未知の scope は例外 (黙って全件返さない)');

select throws_ok(
  $$ select * from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint,
       null, 'seasonBest') $$,
  'P0001', null,
  'V-DB-44b: 未知の aggregation は例外');

-- ---------------------------------------------------------------------------
-- V-DB-44c〜f: NULL の入力値ガード
--
-- SQL の三値論理では `NULL NOT IN ('teamCompetitions','allCompetitions')` は
-- FALSE ではなく **NULL** で、plpgsql の IF は NULL を偽として扱うため
-- `IS NULL` を先に書かないとガードを素通りする。素通りすると:
--   p_scope    := NULL → WHERE の (p_scope = 'allCompetitions' OR c.team_id = ...) で
--                        静かに teamCompetitions 相当になる
--   p_aggregation := NULL → (p_aggregation = 'allRaces' OR rn = 1) で
--                           静かに personalBest 相当になる
--   p_style_id / p_pool_type := NULL → `r.style_id = NULL` はどの行にもマッチせず
--                                      「エラーではなく空のランキング」に化ける
-- いずれも例外が出ないまま別の意味の結果を返すので、必ず例外にする。
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select * from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, null, 2, 0::smallint) $$,
  'P0001', null,
  'V-DB-44c: p_scope = NULL は例外 (三値論理でガードを素通りして teamCompetitions 相当にならない)');

select throws_ok(
  $$ select * from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint,
       null, null) $$,
  'P0001', null,
  'V-DB-44d: p_aggregation = NULL は例外 (静かに personalBest 相当にならない)');

select throws_ok(
  $$ select * from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', null, 0::smallint) $$,
  'P0001', null,
  'V-DB-44e: p_style_id = NULL は例外 (空のランキングに化けない)');

select throws_ok(
  $$ select * from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, null) $$,
  'P0001', null,
  'V-DB-44f: p_pool_type = NULL は例外 (空のランキングに化けない)');

-- ---------------------------------------------------------------------------
-- V-DB-44g〜i: 「意味のある NULL」は例外にしない (過剰なガードで機能を壊していない)
--   p_gender      NULL = 男女すべて
--   p_fiscal_year NULL = 通算
--   p_limit       NULL = 既定 50
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select * from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint,
       null, 'personalBest', null, false, null) $$,
  'V-DB-44g: p_gender / p_fiscal_year / p_limit の NULL は意味のある NULL なので例外にしない');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint,
     null, 'personalBest', null, false, null)),
  3,
  'V-DB-44h: 意味のある NULL 3つを明示的に渡しても既定と同じ 3 件が返る');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     p_team_id => '22220000-0000-4000-a000-00000000000a'::uuid,
     p_scope => 'teamCompetitions',
     p_style_id => 2,
     p_pool_type => 0::smallint)),
  3,
  'V-DB-44i: 省略時の既定値 (p_gender/p_aggregation/p_fiscal_year/p_limit) でも 3 件が返る');

-- =============================================================================
-- V-DB-45: スコープの中核 (双方向フィクスチャ)
-- =============================================================================
select results_eq(
  $$ select "time" from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint) $$,
  $$ values (30.00::numeric), (31.00::numeric), (33.00::numeric) $$,
  'V-DB-45a: teamCompetitions はチーム大会の 3 件のみをタイム昇順で返す');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint)
   where "time" = 30.00),
  1,
  'V-DB-45b: records.team_id が NULL の web 由来の記録が落ちない (records.team_id で絞っていない)');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint)
   where "time" = 31.00),
  1,
  'V-DB-45c: records.team_id 付きの mobile 由来の記録も含まれる');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint)
   where "time" = 29.00),
  0,
  'V-DB-45d: 他チーム大会に team_alpha の records.team_id が付いた汚染行は teamCompetitions に混ざらない');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint)
   where "time" = 28.50),
  0,
  'V-DB-45e: 一括登録 (competition_id NULL) は teamCompetitions に含まれない');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint)
   where "time" = 27.00),
  0,
  'V-DB-45f: リレーのレグ (最速 27.00) は teamCompetitions から除外される');

select results_eq(
  $$ select "time" from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'allCompetitions', 2, 0::smallint) $$,
  $$ values (28.50::numeric), (29.00::numeric), (30.00::numeric), (31.00::numeric), (32.00::numeric) $$,
  'V-DB-45g: allCompetitions は大会所属を問わず 5 件をタイム昇順で返す');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'allCompetitions', 2, 0::smallint)
   where "time" = 28.50),
  1,
  'V-DB-45h: 一括登録の記録は allCompetitions に含まれる (LEFT JOIN が INNER に退行していない)');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'allCompetitions', 2, 0::smallint)
   where "time" = 27.00),
  0,
  'V-DB-45i: リレーのレグは allCompetitions でも除外される (常に除外)');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'allCompetitions', 2, 0::smallint)
   where "time" = 26.00),
  0,
  'V-DB-45j: 承認待ちメンバーの記録は集計に入らない (閲覧側と集計側の述語が一致している)');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'allCompetitions', 2, 0::smallint)
   where "time" = 25.00),
  0,
  'V-DB-45k: 退会済み (is_active=false) メンバーの記録は集計に入らない');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'allCompetitions', 2, 0::smallint)
   where "time" = 24.00),
  0,
  'V-DB-45l: 非メンバーの記録は集計に入らない (同じ大会に出ていても)');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'allCompetitions', 2, 0::smallint,
     null, 'allRaces')
   where "time" in (24.00, 25.00, 26.00, 27.00)),
  0,
  'V-DB-45m: allRaces に切り替えても除外対象 (非メンバー/退会/承認待ち/リレー) は現れない');

-- ---------------------------------------------------------------------------
-- V-31 (PM 裁定): 掛け持ちメンバーの他チーム大会の記録は
--   allCompetitions では **含める** (それが要望そのもの。意図的な露出拡大)。
--   teamCompetitions では含めない。
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'allCompetitions', 2, 0::smallint)
   where "time" = 32.00),
  1,
  'V-DB-45n (仕様): 掛け持ちメンバーが他チーム大会で出した記録は allCompetitions に含まれる');

select results_eq(
  $$ select "time" from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint)
     where user_id = '11110000-0000-4000-a000-000000000009' $$,
  $$ values (33.00::numeric) $$,
  'V-DB-45o: teamCompetitions では掛け持ちメンバーの行はチーム大会の 33.00 になる (スコープで絞ってから最速を選んでいる)');

-- =============================================================================
-- V-DB-46: 性別フィルタ
-- =============================================================================
select results_eq(
  $$ select "time" from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint, 0::smallint) $$,
  $$ values (30.00::numeric), (33.00::numeric) $$,
  'V-DB-46a: p_gender=0 は男性のみ');

select results_eq(
  $$ select "time" from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint, 1::smallint) $$,
  $$ values (31.00::numeric) $$,
  'V-DB-46b: p_gender=1 は女性のみ');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint, null)),
  3,
  'V-DB-46c: p_gender=NULL は男女すべて (0 の絞り込みではない)');

-- =============================================================================
-- V-DB-47: 集計モード
-- =============================================================================
select results_eq(
  $$ select "time" from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 9, 0::smallint,
       null, 'personalBest') $$,
  $$ values (37.00::numeric), (38.00::numeric) $$,
  'V-DB-47a: personalBest は 1 メンバー 1 行 (u_web の 3 レースから最速 38.00 のみ)');

select results_eq(
  $$ select "time" from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 9, 0::smallint,
       null, 'allRaces') $$,
  $$ values (37.00::numeric), (38.00::numeric), (39.00::numeric), (40.00::numeric) $$,
  'V-DB-47b: allRaces は全レースを返す (4 行)');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 9, 0::smallint,
     null, 'personalBest')
   where user_id = '11110000-0000-4000-a000-000000000001'),
  1,
  'V-DB-47c: personalBest では同一メンバーが 2 行以上出ない');

-- =============================================================================
-- V-DB-48: 年度 (4/1〜翌3/31)
-- =============================================================================
select results_eq(
  $$ select "time" from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 13, 0::smallint,
       null, 'personalBest', 2026) $$,
  $$ values (51.00::numeric), (52.00::numeric) $$,
  'V-DB-48a: 2026 年度は 2026-04-01 と 2027-03-31 の両境界を含む 2 件');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 13, 0::smallint,
     null, 'personalBest', 2026)
   where "time" = 50.00),
  0,
  'V-DB-48b: 2025-03-15 の大会 (2024年度) は 2026 年度に含まれない');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 13, 0::smallint,
     null, 'personalBest', 2026)
   where "time" = 53.00),
  0,
  'V-DB-48c: 2027-04-01 の大会 (2027年度) は 2026 年度に含まれない (境界の外)');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'allCompetitions', 13, 0::smallint,
     null, 'personalBest', 2026)
   where "time" = 54.00),
  0,
  'V-DB-48d: 年度を指定すると大会に紐づかない記録 (競技日が無い) は除外される');

select results_eq(
  $$ select "time" from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 13, 0::smallint,
       null, 'personalBest', 2024) $$,
  $$ values (50.00::numeric) $$,
  'V-DB-48e: 2024 年度 (2024-04-01〜2025-03-31) は 2025-03-15 の記録を拾う');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 13, 0::smallint,
     null, 'personalBest', null)),
  4,
  'V-DB-48f: p_fiscal_year=NULL は通算 (チーム大会の 4 件すべて)');

-- =============================================================================
-- V-DB-49: p_limit のクランプ
-- =============================================================================
select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint,
     null, 'personalBest', null, false, 1)),
  1,
  'V-DB-49a: p_limit=1 は 1 行');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint,
     null, 'personalBest', null, false, 0)),
  1,
  'V-DB-49b: p_limit=0 は例外にせず 1 にクランプする');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint,
     null, 'personalBest', null, false, -5)),
  1,
  'V-DB-49c: p_limit=-5 (負数) も 1 にクランプする');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint,
     null, 'personalBest', null, false, null)),
  3,
  'V-DB-49d: p_limit=NULL は既定 50 として扱われる (母集団 3 件が全部返る)');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 0::smallint,
     null, 'personalBest', null, false, 99999)),
  3,
  'V-DB-49e: p_limit=99999 は 500 にクランプされる (例外にならない)');

-- =============================================================================
-- V-DB-50: 種目・水路の厳密一致
-- =============================================================================
select results_eq(
  $$ select "time" from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 2, 1::smallint) $$,
  $$ values (26.50::numeric) $$,
  'V-DB-50a: 長水路 (pool_type=1) には短水路の記録が混ざらない');

select results_eq(
  $$ select "time" from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', 3, 0::smallint) $$,
  $$ values (70.00::numeric) $$,
  'V-DB-50b: 100m 自由形 (style_id=3) には 50m 自由形の記録が混ざらない');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'allCompetitions', 2, 0::smallint,
     null, 'allRaces')
   where "time" = 20.00),
  0,
  'V-DB-50c: CHECK 制約が無い異常な pool_type=5 の記録は短水路に混ざらない');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     '22220000-0000-4000-a000-00000000000a'::uuid, 'allCompetitions', 2, 1::smallint,
     null, 'allRaces')
   where "time" = 20.00),
  0,
  'V-DB-50d: 異常な pool_type=5 の記録は長水路にも混ざらない (正規化して押し込まない)');

-- =============================================================================
-- V-DB-51: 並び順と同着のタイブレーク
-- =============================================================================
select results_eq(
  $$ select competition_title from public.get_team_record_rankings(
       '22220000-0000-4000-a000-00000000000a'::uuid, 'allCompetitions', 21, 0::smallint,
       null, 'allRaces') $$,
  $$ values ('QA Rank FyStart'::text), ('QA Rank CompAlpha'::text), (null::text) $$,
  'V-DB-51a: 同着は大会日 ASC NULLS LAST でタイブレークされる (大会なしが最後)');

select ok(
  (select bool_and(prev is null or prev <= cur)
   from (
     select "time" as cur, lag("time") over (order by ord) as prev
     from (
       select "time", row_number() over () as ord
       from public.get_team_record_rankings(
         '22220000-0000-4000-a000-00000000000a'::uuid, 'allCompetitions', 2, 0::smallint,
         null, 'allRaces')
     ) t
   ) u),
  'V-DB-51b: 返り値はタイム昇順 (クライアント側の順位付与がこの並びを前提にしている)');

select public.qa_logout();

select * from finish();
rollback;
