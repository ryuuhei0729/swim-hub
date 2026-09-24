-- =============================================================================
-- pgTAP: 年度 (4/1〜翌3/31) の**境界オフバイワン**に絞った検証
--        (QA Sprint Contract 第2弾 Phase A / [V-P2-23][V-P2-24])
--
-- 対象 migration (どちらも既に適用済み・本ファイルは migration ではない):
--   20260907000000_team_record_rankings_rpc.sql   … get_team_record_rankings
--   20260908000100_*.sql                           … get_team_relay_rankings
--
-- なぜ pgTAP か:
--   境界式 `c.date >= make_date(y,4,1) AND c.date <= make_date(y+1,3,31)` は
--   **RPC が唯一の定義元**であり、UI テストは fake の戻り値を見るだけなので
--   オフバイワンを原理的に検出できない (fake が答えを決めてしまう)。
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 既存カバレッジとの重複回避 (実測して差分だけを書いた)
--
-- 既に 11_team_record_rankings_rpc.test.sql が持っているもの:
--   V-DB-48a  FY2026 が 2026-04-01 と 2027-03-31 の両境界を**含む**
--   V-DB-48b  2025-03-15 (FY2024) は FY2026 に入らない
--   V-DB-48c  2027-04-01 (FY2027) は FY2026 に入らない
--   V-DB-48d  年度指定時は大会に紐づかない記録が除外される
--   V-DB-48e  FY2024 が 2025-03-15 を拾う
--   V-DB-48f  p_fiscal_year=NULL は通算
-- 12_team_relay_rankings_rpc.test.sql が持っているもの:
--   V-DB-72c  FY2026 が 2027-08-09 (遠く外) を除外する
--   V-DB-72d  年度指定時は大会に紐づかないリレー行が除外される
--
-- **本ファイルが埋める穴は4つだけ**:
--   V-DB-80  個人: 下端の**1日前** (2026-03-31) が FY2026 に入らない
--            (既存は 2025-03-15 = 遠く外 と 2027-04-01 = 上端+1 しか無く、
--             下端側の隣接日を突いていない)
--   V-DB-81  個人: 🚨 **3/31 と 4/1 の2件が別年度へ1件ずつ振り分けられる**
--            (既存は「含む」「含まない」を別々の年度で見ており、
--             跨ぎのペアが**どちらにも入る/どちらにも入らない**形の
--             バグを検出できない)
--   V-DB-82  リレー: 下端 2026-04-01 と上端 2027-03-31 を**含む**
--            (既存は遠く外の除外のみで、境界の内側を確認していない)
--   V-DB-83  リレー: 3/31 と 4/1 が別年度へ振り分けられる + 下端1日前の除外
--   V-DB-84  両方: 記録が1件も無い年度は**0行を返す** (例外にしない)
--            = 年度の選択肢を静的にした帰結 ([V-P2-34] の DB 側)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 実行: ローカル Supabase 起動済み + migration 適用済みで `supabase test db`。
--       フィクスチャは rollback で消える。
--
-- ⚠️ フィクスチャ作成上の注意 (11/12 と同じ罠):
--   - auth.users への INSERT は on_auth_user_created トリガーが public.users を
--     自動生成する。public.users へ直接 INSERT すると PK 重複になる。
--   - public.teams の作成者列は created_by (user_id ではない)。
--   - team_memberships.role の CHECK は 'admin' | 'user' ('member' は不可)。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

-- -----------------------------------------------------------------------------
-- ヘルパー (01/04/10/11/12 と同型)
-- -----------------------------------------------------------------------------
create function public.qa_fy_login_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- =============================================================================
-- フィクスチャ
--
-- 大会日は**境界の隣接4日ちょうど**を置く。値は年度で一意に決まるので、
-- 期待値をタイムの値そのもので書ける (件数だけで見ると振り分けの入れ替わりを
-- 見逃す)。
--
--   comp_before  2026-03-31  … FY2025 の**上端**        / FY2026 の下端 −1日
--   comp_start   2026-04-01  … FY2026 の**下端**
--   comp_end     2027-03-31  … FY2026 の**上端**
--   comp_after   2027-04-01  … FY2027 の**下端**        / FY2026 の上端 +1日
--
-- 個人記録のタイムは大会日と1対1に対応させる:
--   2026-03-31 → 61.00 / 2026-04-01 → 62.00 / 2027-03-31 → 63.00 / 2027-04-01 → 64.00
-- リレーの総合タイムも同様:
--   2026-03-31 → 261.00 / 2026-04-01 → 262.00 / 2027-03-31 → 263.00 / 2027-04-01 → 264.00
--
-- 名前・チーム名は期待値 (数値) の部分文字列にならない語にする。
-- =============================================================================
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaa0000-0000-4000-a000-000000000001', 'qa-fy-owner@example.test',  '{"name":"QA_FY_OWNER","gender":0}'),
  ('aaaa0000-0000-4000-a000-000000000002', 'qa-fy-second@example.test', '{"name":"QA_FY_SECOND","gender":0}'),
  ('aaaa0000-0000-4000-a000-000000000003', 'qa-fy-third@example.test',  '{"name":"QA_FY_THIRD","gender":0}'),
  ('aaaa0000-0000-4000-a000-000000000004', 'qa-fy-fourth@example.test', '{"name":"QA_FY_FOURTH","gender":0}');

insert into public.teams (id, name, invite_code, created_by) values
  ('bbbb0000-0000-4000-a000-00000000000a', 'QA Fiscal Boundary Squad', 'QA-FY-BOUND',
   'aaaa0000-0000-4000-a000-000000000001');

insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at) values
  ('bbbb0000-0000-4000-a000-00000000000a', 'aaaa0000-0000-4000-a000-000000000001', 'admin', 'approved', true, '2025-01-01'),
  ('bbbb0000-0000-4000-a000-00000000000a', 'aaaa0000-0000-4000-a000-000000000002', 'user',  'approved', true, '2025-01-01'),
  ('bbbb0000-0000-4000-a000-00000000000a', 'aaaa0000-0000-4000-a000-000000000003', 'user',  'approved', true, '2025-01-01'),
  ('bbbb0000-0000-4000-a000-00000000000a', 'aaaa0000-0000-4000-a000-000000000004', 'user',  'approved', true, '2025-01-01');

insert into public.competitions (id, title, date, pool_type, created_by, team_id) values
  ('cccc0000-0000-4000-a000-000000000001', 'QA FY Meet Before', '2026-03-31', 1,
   'aaaa0000-0000-4000-a000-000000000001', 'bbbb0000-0000-4000-a000-00000000000a'),
  ('cccc0000-0000-4000-a000-000000000002', 'QA FY Meet Start',  '2026-04-01', 1,
   'aaaa0000-0000-4000-a000-000000000001', 'bbbb0000-0000-4000-a000-00000000000a'),
  ('cccc0000-0000-4000-a000-000000000003', 'QA FY Meet End',    '2027-03-31', 1,
   'aaaa0000-0000-4000-a000-000000000001', 'bbbb0000-0000-4000-a000-00000000000a'),
  ('cccc0000-0000-4000-a000-000000000004', 'QA FY Meet After',  '2027-04-01', 1,
   'aaaa0000-0000-4000-a000-000000000001', 'bbbb0000-0000-4000-a000-00000000000a'),
  -- 「以前バケット」に入る古い大会 (FY2023)。`or_earlier` に下端が無いことの母集団
  ('cccc0000-0000-4000-a000-000000000005', 'QA FY Meet Ancient', '2023-05-01', 1,
   'aaaa0000-0000-4000-a000-000000000001', 'bbbb0000-0000-4000-a000-00000000000a');

-- 個人記録。種目は Fr 100m を実データから引く (styleId をハードコードしない)
insert into public.records (id, user_id, style_id, "time", pool_type, competition_id, team_id)
select
  v.rid::uuid,
  v.uid::uuid,
  (select id from public.styles where style = 'Fr' and distance = 100),
  v.t,
  1,
  v.cid::uuid,
  'bbbb0000-0000-4000-a000-00000000000a'
from (values
  ('dddd0000-0000-4000-a000-000000000001', 'aaaa0000-0000-4000-a000-000000000001', 61.00, 'cccc0000-0000-4000-a000-000000000001'),
  ('dddd0000-0000-4000-a000-000000000002', 'aaaa0000-0000-4000-a000-000000000002', 62.00, 'cccc0000-0000-4000-a000-000000000002'),
  ('dddd0000-0000-4000-a000-000000000003', 'aaaa0000-0000-4000-a000-000000000003', 63.00, 'cccc0000-0000-4000-a000-000000000003'),
  ('dddd0000-0000-4000-a000-000000000004', 'aaaa0000-0000-4000-a000-000000000004', 64.00, 'cccc0000-0000-4000-a000-000000000004'),
  ('dddd0000-0000-4000-a000-000000000005', 'aaaa0000-0000-4000-a000-000000000001', 60.00, 'cccc0000-0000-4000-a000-000000000005')
) as v(rid, uid, t, cid);

-- 一括登録記録 (competition_id が NULL)。年度が決まらないので**どの年度バケットにも
-- 入らない**が、通算には出る。`or_earlier` でも除外されることを確認する母集団。
insert into public.records (id, user_id, style_id, "time", pool_type, competition_id, team_id)
values (
  'dddd0000-0000-4000-a000-00000000000f',
  'aaaa0000-0000-4000-a000-000000000002',
  (select id from public.styles where style = 'Fr' and distance = 100),
  65.00, 1, null, 'bbbb0000-0000-4000-a000-00000000000a');

-- リレー記録 (同じ4大会に1本ずつ)
insert into public.relay_records
  (id, team_id, competition_id, relay_kind, leg_distance, leg_count, pool_type,
   gender_category, total_time, created_by)
values
  ('eeee0000-0000-4000-a000-000000000001', 'bbbb0000-0000-4000-a000-00000000000a',
   'cccc0000-0000-4000-a000-000000000001', 'free', 100, 4, 1, 'male', 261.00,
   'aaaa0000-0000-4000-a000-000000000001'),
  ('eeee0000-0000-4000-a000-000000000002', 'bbbb0000-0000-4000-a000-00000000000a',
   'cccc0000-0000-4000-a000-000000000002', 'free', 100, 4, 1, 'male', 262.00,
   'aaaa0000-0000-4000-a000-000000000001'),
  ('eeee0000-0000-4000-a000-000000000003', 'bbbb0000-0000-4000-a000-00000000000a',
   'cccc0000-0000-4000-a000-000000000003', 'free', 100, 4, 1, 'male', 263.00,
   'aaaa0000-0000-4000-a000-000000000001'),
  ('eeee0000-0000-4000-a000-000000000004', 'bbbb0000-0000-4000-a000-00000000000a',
   'cccc0000-0000-4000-a000-000000000004', 'free', 100, 4, 1, 'male', 264.00,
   'aaaa0000-0000-4000-a000-000000000001'),
  ('eeee0000-0000-4000-a000-000000000005', 'bbbb0000-0000-4000-a000-00000000000a',
   'cccc0000-0000-4000-a000-000000000005', 'free', 100, 4, 1, 'male', 260.00,
   'aaaa0000-0000-4000-a000-000000000001'),
  -- 一括登録リレー (competition_id が NULL)
  ('eeee0000-0000-4000-a000-00000000000f', 'bbbb0000-0000-4000-a000-00000000000a',
   null, 'free', 100, 4, 1, 'male', 265.00,
   'aaaa0000-0000-4000-a000-000000000001');

select public.qa_fy_login_as('aaaa0000-0000-4000-a000-000000000001');

-- =============================================================================
-- V-DB-80: 個人 — 下端の 1 日前 (2026-03-31) は FY2026 に入らない
-- =============================================================================
select is(
  (select count(*)::int from public.get_team_record_rankings(
     'bbbb0000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions',
     (select id from public.styles where style = 'Fr' and distance = 100),
     1::smallint, null, 'allRaces', 2026)
   where "time" = 61.00),
  0,
  'V-DB-80a: 2026-03-31 (下端の1日前) の記録は FY2026 に含まれない');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     'bbbb0000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions',
     (select id from public.styles where style = 'Fr' and distance = 100),
     1::smallint, null, 'allRaces', 2025)
   where "time" = 61.00),
  1,
  'V-DB-80b: 2026-03-31 は FY2025 の上端として含まれる (どこにも消えない)');

-- =============================================================================
-- V-DB-81: 🚨 個人 — 3/31 と 4/1 のペアが**別年度へ 1 件ずつ**振り分けられる
--   件数だけを見ると「両方に入る」「両方から漏れる」を見逃すので、
--   タイムの値そのもので突き合わせる。
-- =============================================================================
select results_eq(
  $$ select "time" from public.get_team_record_rankings(
       'bbbb0000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions',
       (select id from public.styles where style = 'Fr' and distance = 100),
       1::smallint, null, 'allRaces', 2025) $$,
  $$ values (61.00::numeric) $$,
  'V-DB-81a: FY2025 は 2026-03-31 の 1 件だけ (4/1 側が混ざらない)');

select results_eq(
  $$ select "time" from public.get_team_record_rankings(
       'bbbb0000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions',
       (select id from public.styles where style = 'Fr' and distance = 100),
       1::smallint, null, 'allRaces', 2026) $$,
  $$ values (62.00::numeric), (63.00::numeric) $$,
  'V-DB-81b: FY2026 は 2026-04-01 と 2027-03-31 の 2 件 (下端1日前と上端1日後を含まない)');

select results_eq(
  $$ select "time" from public.get_team_record_rankings(
       'bbbb0000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions',
       (select id from public.styles where style = 'Fr' and distance = 100),
       1::smallint, null, 'allRaces', 2027) $$,
  $$ values (64.00::numeric) $$,
  'V-DB-81c: FY2027 は 2027-04-01 の 1 件だけ (上端 3/31 が混ざらない)');

-- 🚨 **スコープと年度は別の除外理由**である。ここを取り違えると
--    「一括登録が落ちるのは年度のせい」という誤った説明を UI に書いてしまう。
--      teamCompetitions … `c.team_id = p_team_id` で絞るので、大会を持たない
--                          一括登録記録は**年度に関係なく常に**落ちる
--      allCompetitions  … 一括登録記録も母集団に入るので、**年度指定でだけ**落ちる
--    ([V-P2-28] の UI 説明は `allCompetitions` のときに意味を持つ)
--    QA 実測: 最初 teamCompetitions で「通算 6 件」と書いて赤にした。
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🚨 **UI の注意書き (`teams.ranking.period.fiscalYearNote`) の出し分けの根拠**
--    (PM 裁定 2026-09-09。ここが唯一の実測の裏付けなので残す)
--
--    「年度を選ぶと大会に紐づかない記録は含まれません」が**事実になるのは
--    個人種目 + allCompetitions のときだけ**である:
--
--      個人 + allCompetitions + 年度 → 出す   … 通算では出ていた行が年度で落ちる
--      個人 + teamCompetitions + 年度 → 出さない … 通算でも既に落ちているので、
--                                        「年度が原因で消えた」と誤読させる
--      リレー + 年度                 → 出さない … 下記の理由で事象が発生しえない
--
--    ⚠️ **リレーで出さない根拠は「型」である** (コメントではない)。
--       `apps/shared/api/teams/relayRecords.ts` の
--       `RelayRecordReplaceScope.competitionId` は **`string` (非 nullable)** で、
--       insert ビルダーも必須にしている。つまり
--       **`relay_records.competition_id = NULL` の行を作るアプリ経路が存在しない。**
--       列が nullable なのは将来の直接入力のための予約
--       (`apps/shared/types/relayRecord.ts` の `competitionId` の docstring)。
--
--    ⚠️ **将来の復活条件**: `RelayRecordReplaceScope.competitionId` が
--       `string | null` になる / 大会に紐づかないリレーの入力 UI が入る、
--       のどちらかが起きたら**リレーでも注意書きを有効に戻すこと**。
--
--    📌 **撤回した観点の記録** — QA は当初
--       「説明の有無が個人・リレーで非対称になっていないこと」を観点にしていた。
--       **これは誤った前提だった。** 非対称が正しい仕様である。
--       次にこの画面を触る人が「揃えるべき」と判断して
--       **リレーに嘘の注意書きを復活させないため**に、ここに残す。
--
--    ⚠️ 下の一括登録リレー行 (`eeee0000-...-00000000000f`, total_time 265.00) は
--       **アプリ経路では作れない合成データ**である。RPC 側の防御
--       (`c.date` が NULL なら年度指定で落ちる) を確認するために置いているだけで、
--       「UI がこの状態を扱う必要がある」ことを意味しない。
-- ─────────────────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.get_team_record_rankings(
     'bbbb0000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions', (select id from public.styles where style = 'Fr' and distance = 100),
     1::smallint, null, 'allRaces', null)),
  5,
  'V-DB-81d: teamCompetitions の通算は 5 件 (境界4 + 古い1)。一括登録はスコープで落ちる');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     'bbbb0000-0000-4000-a000-00000000000a'::uuid, 'allCompetitions',
     (select id from public.styles where style = 'Fr' and distance = 100),
     1::smallint, null, 'allRaces', null)
   where "time" = 65.00),
  1,
  'V-DB-81e: allCompetitions の通算には一括登録 (65.00) が出る (年度指定でだけ落ちる)');

-- =============================================================================
-- V-DB-82: リレー — 下端 2026-04-01 と上端 2027-03-31 を**含む**
--   (12_ は遠く外の除外だけを見ており、境界の内側を確認していない)
-- =============================================================================
select results_eq(
  $$ select total_time from public.get_team_relay_rankings(
       'bbbb0000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint,
       'male', 2026) $$,
  $$ values (262.00::numeric), (263.00::numeric) $$,
  'V-DB-82a: リレーの FY2026 は 2026-04-01 と 2027-03-31 の両境界を含む 2 件');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     'bbbb0000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint,
     'male', 2026)
   where total_time = 261.00),
  0,
  'V-DB-82b: リレーも 2026-03-31 (下端の1日前) を FY2026 に含めない');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     'bbbb0000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint,
     'male', 2026)
   where total_time = 264.00),
  0,
  'V-DB-82c: リレーも 2027-04-01 (上端の1日後) を FY2026 に含めない');

-- =============================================================================
-- V-DB-83: リレー — 3/31 と 4/1 のペアが別年度へ 1 件ずつ
-- =============================================================================
select results_eq(
  $$ select total_time from public.get_team_relay_rankings(
       'bbbb0000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint,
       'male', 2025) $$,
  $$ values (261.00::numeric) $$,
  'V-DB-83a: リレーの FY2025 は 2026-03-31 の 1 件だけ');

select results_eq(
  $$ select total_time from public.get_team_relay_rankings(
       'bbbb0000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint,
       'male', 2027) $$,
  $$ values (264.00::numeric) $$,
  'V-DB-83b: リレーの FY2027 は 2027-04-01 の 1 件だけ');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     'bbbb0000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint, 'male', null)),
  6,
  'V-DB-83c: リレーの通算は 6 件 (境界4 + 古い1 + 一括登録1)');

-- =============================================================================
-- V-DB-84: 記録が 1 件も無い年度は 0 行を返す (例外にしない)
--   年度の選択肢を**静的**にした帰結。選択肢に出た年度を選んだだけで
--   エラーになってはいけない ([V-P2-34] の DB 側の裏付け)。
-- =============================================================================
select is(
  (select count(*)::int from public.get_team_record_rankings(
     'bbbb0000-0000-4000-a000-00000000000a'::uuid, 'teamCompetitions',
     (select id from public.styles where style = 'Fr' and distance = 100),
     1::smallint, null, 'allRaces', 2019)),
  0,
  'V-DB-84a: 記録が無い年度 (2019) は 0 行。例外にしない');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     'bbbb0000-0000-4000-a000-00000000000a'::uuid, 'free', 100, 1::smallint,
     'male', 2019)),
  0,
  'V-DB-84b: リレーも記録が無い年度は 0 行。例外にしない');


-- =============================================================================
-- V-DB-85〜92: `p_fiscal_year_or_earlier` (migration 20260909000000)
--
-- 「2023年度以前」は単一整数の `p_fiscal_year` では表現できない (上下両端を
-- 閉じるので開区間が渡せない)。そこで boolean を足して**下端を外す**。
--
--   p_fiscal_year IS NULL                 → 通算 (boolean は無視)
--   p_fiscal_year = Y, or_earlier = false → FY Y のみ
--   p_fiscal_year = Y, or_earlier = true  → c.date <= make_date(Y+1,3,31) のみ
--
-- 🚨 UI テストでは検出できない (fake が戻り値を決めてしまう) ので pgTAP で固定する。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- V-DB-85: 旧シグネチャが DROP されている (オーバーロードを残していない)
--   ⚠️ 引数を足して `CREATE OR REPLACE` しただけだと**同名2シグネチャ**になり、
--      PostgREST が「どちらを呼ぶか決められない」でエラーを返してタブが丸ごと死ぬ。
-- -----------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_team_record_rankings'),
  1,
  'V-DB-85a: get_team_record_rankings は 1 シグネチャだけ (旧版が残っていない)');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_team_relay_rankings'),
  1,
  'V-DB-85b: get_team_relay_rankings は 1 シグネチャだけ (旧版が残っていない)');

-- -----------------------------------------------------------------------------
-- V-DB-86: 権限が付け直されている
--   ⚠️ DROP FUNCTION は**その関数に付いた権限も一緒に落とす**ので、
--      REVOKE/GRANT を書き忘れると anon が実行できる状態か、
--      authenticated が実行できない状態のどちらかになる。
-- -----------------------------------------------------------------------------
select ok(
  NOT has_function_privilege('anon',
    'public.get_team_record_rankings(uuid, text, integer, smallint, smallint, text, integer, boolean, integer)',
    'execute'),
  'V-DB-86a: anon は個人ランキング RPC を実行できない (REVOKE が付け直されている)');

select ok(
  has_function_privilege('authenticated',
    'public.get_team_record_rankings(uuid, text, integer, smallint, smallint, text, integer, boolean, integer)',
    'execute'),
  'V-DB-86b: authenticated は実行できる (GRANT が付け直されている)');

select ok(
  NOT has_function_privilege('anon',
    'public.get_team_relay_rankings(uuid, text, integer, smallint, text, integer, boolean, integer)',
    'execute'),
  'V-DB-86c: anon はリレーランキング RPC を実行できない');

select ok(
  has_function_privilege('authenticated',
    'public.get_team_relay_rankings(uuid, text, integer, smallint, text, integer, boolean, integer)',
    'execute'),
  'V-DB-86d: authenticated はリレーも実行できる');

-- -----------------------------------------------------------------------------
-- V-DB-87: or_earlier = true は**下端を持たない**
--   ≤FY2026 は 2023-05-01 (FY2023) まで遡って拾う。
-- -----------------------------------------------------------------------------
select results_eq(
  $$ select "time" from public.get_team_record_rankings(
       p_team_id => 'bbbb0000-0000-4000-a000-00000000000a'::uuid,
       p_scope => 'teamCompetitions',
       p_style_id => (select id from public.styles where style = 'Fr' and distance = 100),
       p_pool_type => 1::smallint, p_gender => null, p_aggregation => 'allRaces',
       p_fiscal_year => 2026, p_fiscal_year_or_earlier => true) $$,
  $$ values (60.00::numeric), (61.00::numeric), (62.00::numeric), (63.00::numeric) $$,
  'V-DB-87a: or_earlier=true は下端が無く FY2023 の 60.00 まで遡る (4 件)');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     p_team_id => 'bbbb0000-0000-4000-a000-00000000000a'::uuid,
     p_relay_kind => 'free', p_leg_distance => 100, p_pool_type => 1::smallint,
     p_gender_category => 'male', p_fiscal_year => 2026,
     p_fiscal_year_or_earlier => true)),
  4,
  'V-DB-87b: リレーも or_earlier=true で下端が無く 4 件 (260/261/262/263)');

-- -----------------------------------------------------------------------------
-- V-DB-88: or_earlier の**上端は exact と同じ式**である
--   `make_date(Y+1,3,31)` を含み `make_date(Y+1,4,1)` を含まない。
--   片方の分岐だけ上端を直す退行を検出する。
-- -----------------------------------------------------------------------------
select is(
  (select count(*)::int from public.get_team_record_rankings(
     p_team_id => 'bbbb0000-0000-4000-a000-00000000000a'::uuid,
     p_scope => 'teamCompetitions',
     p_style_id => (select id from public.styles where style = 'Fr' and distance = 100),
     p_pool_type => 1::smallint, p_gender => null, p_aggregation => 'allRaces',
     p_fiscal_year => 2026, p_fiscal_year_or_earlier => true)
   where "time" = 63.00),
  1,
  'V-DB-88a: or_earlier の上端は 2027-03-31 を**含む**');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     p_team_id => 'bbbb0000-0000-4000-a000-00000000000a'::uuid,
     p_scope => 'teamCompetitions',
     p_style_id => (select id from public.styles where style = 'Fr' and distance = 100),
     p_pool_type => 1::smallint, p_gender => null, p_aggregation => 'allRaces',
     p_fiscal_year => 2026, p_fiscal_year_or_earlier => true)
   where "time" = 64.00),
  0,
  'V-DB-88b: or_earlier の上端は 2027-04-01 を**含まない**');

-- -----------------------------------------------------------------------------
-- V-DB-89: 🚨 一括登録 (c.date IS NULL) は or_earlier でも除外される
--   述語が `c.date` 上なので自動的にそうなるが、`or_earlier` の分岐に
--   `OR c.date IS NULL` を書いてしまう実装を検出する。
-- -----------------------------------------------------------------------------
-- ⚠️ **`allCompetitions` で見ること。** `teamCompetitions` だと一括登録は
--    スコープ側で常に落ちるので、`or_earlier` の挙動と無関係に 0 になり
--    **トートロジー**になる (QA が最初に踏んだ)。
select is(
  (select count(*)::int from public.get_team_record_rankings(
     p_team_id => 'bbbb0000-0000-4000-a000-00000000000a'::uuid,
     p_scope => 'allCompetitions',
     p_style_id => (select id from public.styles where style = 'Fr' and distance = 100),
     p_pool_type => 1::smallint, p_gender => null, p_aggregation => 'allRaces',
     p_fiscal_year => 2026, p_fiscal_year_or_earlier => true)
   where "time" = 65.00),
  0,
  'V-DB-89a: 一括登録 (65.00) は allCompetitions + or_earlier=true でも除外される');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     p_team_id => 'bbbb0000-0000-4000-a000-00000000000a'::uuid,
     p_relay_kind => 'free', p_leg_distance => 100, p_pool_type => 1::smallint,
     p_gender_category => 'male', p_fiscal_year => 2026,
     p_fiscal_year_or_earlier => true)
   where total_time = 265.00),
  0,
  'V-DB-89b: リレーの一括登録 (265.00) も or_earlier=true で除外される');

-- -----------------------------------------------------------------------------
-- V-DB-90: 🚨 or_earlier = true かつ p_fiscal_year IS NULL は例外
--   黙って通算に落とすと「通算」と意味が二重になる。
-- -----------------------------------------------------------------------------
select throws_ok(
  $$ select * from public.get_team_record_rankings(
       p_team_id => 'bbbb0000-0000-4000-a000-00000000000a'::uuid,
       p_scope => 'teamCompetitions',
       p_style_id => 3, p_pool_type => 1::smallint, p_gender => null,
       p_aggregation => 'allRaces',
       p_fiscal_year => null, p_fiscal_year_or_earlier => true) $$,
  'p_fiscal_year is required when p_fiscal_year_or_earlier is true',
  'V-DB-90a: or_earlier=true + p_fiscal_year NULL は例外 (通算に落とさない)');

select throws_ok(
  $$ select * from public.get_team_relay_rankings(
       p_team_id => 'bbbb0000-0000-4000-a000-00000000000a'::uuid,
       p_relay_kind => 'free', p_leg_distance => 100, p_pool_type => 1::smallint,
       p_gender_category => 'male', p_fiscal_year => null,
       p_fiscal_year_or_earlier => true) $$,
  'p_fiscal_year is required when p_fiscal_year_or_earlier is true',
  'V-DB-90b: リレーも or_earlier=true + NULL 年度は例外');

-- -----------------------------------------------------------------------------
-- V-DB-91: boolean の NULL が COALESCE で false に落ちる
--   `NULL AND ...` は三値論理で NULL になり述語が無効化されるため、
--   `COALESCE(p_fiscal_year_or_earlier, false)` で受ける必要がある。
--
--   📌 **QA のミューテーション実測で分かったこと (2026-09-09)**:
--      述語は2分岐で、`COALESCE` が2箇所に書かれている。
--
--        (COALESCE(or_earlier,false) AND c.date <= upper)                -- 1段目
--        OR (NOT COALESCE(or_earlier,false) AND lower <= c.date <= upper) -- 2段目
--
--      **load-bearing なのは2段目 (`NOT COALESCE(...)`) だけ**である。
--      1段目の `COALESCE` を外しても挙動は変わらない:
--        or_earlier=true  → 1段目 `true AND ...`      … 同じ
--        or_earlier=false → 1段目 false / 2段目が決める … 同じ
--        or_earlier=NULL  → 1段目 NULL / 2段目 `NOT COALESCE(NULL,false)`=true … 同じ
--      実測: 1段目だけ外すミューテーション (N3) は **33/33 緑のまま**、
--            両方外すミューテーション (N4) で V-DB-91a/91b が赤になった。
--
--      ⚠️ したがって 1段目の `COALESCE` は**冗長**である。消してよいという意味ではなく、
--         「NULL 対策を固めるつもりで 1段目だけ直しても何も守れない」という注意。
--         防御は 2段目にある。
-- -----------------------------------------------------------------------------
select results_eq(
  $$ select "time" from public.get_team_record_rankings(
       p_team_id => 'bbbb0000-0000-4000-a000-00000000000a'::uuid,
       p_scope => 'teamCompetitions',
       p_style_id => (select id from public.styles where style = 'Fr' and distance = 100),
       p_pool_type => 1::smallint, p_gender => null, p_aggregation => 'allRaces',
       p_fiscal_year => 2026, p_fiscal_year_or_earlier => null) $$,
  $$ values (62.00::numeric), (63.00::numeric) $$,
  'V-DB-91a: or_earlier=NULL は false と同じ = FY2026 の 2 件だけ');

select is(
  (select count(*)::int from public.get_team_relay_rankings(
     p_team_id => 'bbbb0000-0000-4000-a000-00000000000a'::uuid,
     p_relay_kind => 'free', p_leg_distance => 100, p_pool_type => 1::smallint,
     p_gender_category => 'male', p_fiscal_year => 2026,
     p_fiscal_year_or_earlier => null)),
  2,
  'V-DB-91b: リレーも or_earlier=NULL は false と同じ (2 件)');

-- -----------------------------------------------------------------------------
-- V-DB-92: 🚨 5択が母集団を**漏れなく重複なく**分割する
--
-- UI の選択肢は 通算 / 現年度 / 現年度-1 / 現年度-2 / 「現年度-3 年度以前」。
-- 「以前バケットの上端」を取り違えると
--   - 上端を 現年度-2 にすると **現年度-2 が二重に数えられる**
--   - 上端を 現年度-4 にすると **現年度-3 がどこにも入らない**
-- どちらも**合計のズレ**として現れるので、合計で固定する。
--
-- このフィクスチャで「現年度」を 2027 とすると:
--   FY2027    → 64.00                     (1 件)
--   FY2026    → 62.00, 63.00              (2 件)
--   FY2025    → 61.00                     (1 件)
--   ≤FY2024   → 60.00                     (1 件)
--   合計 5 件。通算 6 件との差 1 件は一括登録 (65.00) = V-DB-81e で固定済み。
-- -----------------------------------------------------------------------------
select is(
  (
    (select count(*)::int from public.get_team_record_rankings(
       p_team_id => 'bbbb0000-0000-4000-a000-00000000000a'::uuid,
       p_scope => 'teamCompetitions',
       p_style_id => (select id from public.styles where style = 'Fr' and distance = 100),
       p_pool_type => 1::smallint, p_gender => null, p_aggregation => 'allRaces',
       p_fiscal_year => 2027, p_fiscal_year_or_earlier => false))
  + (select count(*)::int from public.get_team_record_rankings(
       p_team_id => 'bbbb0000-0000-4000-a000-00000000000a'::uuid,
       p_scope => 'teamCompetitions',
       p_style_id => (select id from public.styles where style = 'Fr' and distance = 100),
       p_pool_type => 1::smallint, p_gender => null, p_aggregation => 'allRaces',
       p_fiscal_year => 2026, p_fiscal_year_or_earlier => false))
  + (select count(*)::int from public.get_team_record_rankings(
       p_team_id => 'bbbb0000-0000-4000-a000-00000000000a'::uuid,
       p_scope => 'teamCompetitions',
       p_style_id => (select id from public.styles where style = 'Fr' and distance = 100),
       p_pool_type => 1::smallint, p_gender => null, p_aggregation => 'allRaces',
       p_fiscal_year => 2025, p_fiscal_year_or_earlier => false))
  + (select count(*)::int from public.get_team_record_rankings(
       p_team_id => 'bbbb0000-0000-4000-a000-00000000000a'::uuid,
       p_scope => 'teamCompetitions',
       p_style_id => (select id from public.styles where style = 'Fr' and distance = 100),
       p_pool_type => 1::smallint, p_gender => null, p_aggregation => 'allRaces',
       p_fiscal_year => 2024, p_fiscal_year_or_earlier => true))
  ),
  5,
  'V-DB-92a: 3明示年度 + ≤現年度-3 の合計が 5 件 (漏れも二重計上も無い)');

select is(
  (select count(*)::int from public.get_team_record_rankings(
     p_team_id => 'bbbb0000-0000-4000-a000-00000000000a'::uuid,
     p_scope => 'teamCompetitions',
     p_style_id => (select id from public.styles where style = 'Fr' and distance = 100),
     p_pool_type => 1::smallint, p_gender => null, p_aggregation => 'allRaces',
     p_fiscal_year => null)
   where "time" <> 65.00),
  5,
  'V-DB-92b: 通算から一括登録を除くと 5 件 = 5択の合計と一致する');

select * from finish();
rollback;
