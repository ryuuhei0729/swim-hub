-- =============================================================================
-- pgTAP: 週次利用レポート (generate_weekly_usage_report / mark_weekly_usage_report_sent /
--        invoke_weekly_usage_report と2つの新テーブル) の実DB検証
--
-- 仕様: docs/specs/weekly-usage-report.md (成功条件 1〜14 のうち DB 側)
-- 対象 migration:
--   - 20261110000000_add_weekly_usage_reports.sql
--   - 20261110000001_register_weekly_usage_report_cron.sql
--
-- 方針:
--   - 実物の RPC を呼び、返り値 (jsonb) と保存行を見る。集計の述語をテスト側に書いて
--     突き合わせることはしない (同じ式を2回書くトートロジーになるため)。
--   - 期待値は「フィクスチャ投入前に同じ週で1回集計した値 (w0)」からの差分で書く。
--     ローカルの開発 DB には対象週 (2026-10-31〜11-06) の実データや premium の行が
--     既にあるため、絶対値で書くと環境ごとに赤になる。フィクスチャのユーザーは全て新規の
--     uuid なので、distinct で数える指標も差分が加算的になる。
--   - 境界の時刻は JST (+09) のリテラルで書く。S = 2026-10-31 00:00 JST (週の始端)、
--     E = 2026-11-07 00:00 JST (週の終端)、M = 週の中ほど、OLD = 2025-12-30。
--     単純に数える指標は、テーブルごとに「S の1秒前・S ちょうど・E ちょうど」の3行を
--     置き、S ちょうどの1行だけが数えられることを差分に含めている (成功条件 1)。
--     述語をテーブルごとに書く実装でも、どれか1つの `<` → `<=` で赤になる。
--   - 2026-10-31 の週の前週は 2026-10-24 (P)。課金のスナップショットは P と W で2回取る。
--   - スナップショットは「その週の初回集計で1回だけ」取る仕様なので、差分の基準 w0 を取った後は
--     W の保存行とスナップショットを消し、W を未集計の状態に戻してからフィクスチャを入れる。
--
-- 実行: ローカル Supabase 起動済み・対象 migration 適用済みの状態で直接 `psql -f` で実行する
--       (16・17 番と同じく、supabase test db ラッパーより直接実行の結果を正とする)。
--         psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--           -v ON_ERROR_STOP=0 -f supabase/tests/20_weekly_usage_report.test.sql
--       全フィクスチャ・作り直した子・一時テーブル・一時ロール・外した CHECK 制約・止めたトリガは
--       rollback で消える。
--       supabase start のスタックを使えないとき (他のセッションと共有しているときを含む) は、
--       隔離した Postgres を作ってそこで流す:
--         bash supabase/tests/fixtures/isolated-db/setup_db.sh
--         PGPASSWORD=postgres psql -h 127.0.0.1 -p 54399 -U postgres -d postgres -tA \
--           -f supabase/tests/20_weekly_usage_report.test.sql
--       (ホストの psql -f で流す。docker exec の標準入力で流すと、09 番の `\ir ../migrations/...` が
--        解決できずに偽の赤になる)
--       setup_db.sh は同じ image の Postgres を単体で起動し、bare image に無い2点を supabase_admin で補う
--       (postgres では permission denied になる): storage.buckets の列 / auth.uid() などを
--       request.jwt.claims を読む定義にする (fixtures/isolated-db/auth_funcs.sql)。
--       注意: milestones の CHECK 制約を一時的に外し、team_attendance の updated_at トリガを
--       一時的に止めるため、実行中はこの2テーブルにロックがかかる (他のセッションが使っている DB では数秒止まる)。
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(122);

-- -----------------------------------------------------------------------------
-- ヘルパー (rollback で消える)
-- -----------------------------------------------------------------------------
create function public.qa_u(n int) returns uuid language sql immutable as $$
  select ('20200000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

create function public.qa_e(n int) returns uuid language sql immutable as $$
  select ('20200000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid
$$;

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

-- 実行結果の保存先。label: w0 (投入前の W) / p1 (状態 A の P) / w1 (状態 B の W) /
-- w2 (子の作り直し + 送信済み記録の後の W) / w3 (未分類テーブルを足した後の W) / dflt (引数 NULL)
create temporary table qa_runs (label text primary key, result jsonb not null);

-- W の指標の、w0 からの差分。キーが無ければ 0 として扱う
create function pg_temp.qa_delta(p_label text, p_key text) returns numeric language sql stable as $$
  select coalesce((select (result->'metrics'->>p_key)::numeric from qa_runs where label = p_label), 0)
       - coalesce((select (result->'metrics'->>p_key)::numeric from qa_runs where label = 'w0'), 0)
$$;

create function pg_temp.qa_metric(p_label text, p_key text) returns numeric language sql stable as $$
  select (result->'metrics'->>p_key)::numeric from qa_runs where label = p_label
$$;

-- =============================================================================
-- 0. 新テーブルを空にし、14日前 (2026-10-17) の行だけを置いた状態で、投入前の W を集計する
--    (この DB で誰かが既に集計していても、テストの前提をそろえる。rollback で戻る)
-- =============================================================================
delete from public.user_subscription_snapshots;
delete from public.weekly_usage_reports;

insert into public.weekly_usage_reports
  (week_start, period_start, period_end, metrics, uncategorized_tables, generated_at, email_sent_at)
values
  ('2026-10-17', '2026-10-17 00:00:00+09', '2026-10-24 00:00:00+09',
   '{"account.users_new": 999}'::jsonb, '{}'::text[], '2026-10-24 09:00:00+09', '2026-10-24 09:00:05+09');

insert into qa_runs select 'w0', public.generate_weekly_usage_report('2026-10-31');
-- w0 は差分の基準を取るためだけの実行。W を未集計の状態に戻す
delete from public.user_subscription_snapshots where week_start = '2026-10-31';
delete from public.weekly_usage_reports where week_start = '2026-10-31';

-- =============================================================================
-- フィクスチャ
-- =============================================================================

-- ユーザー。auth.users への INSERT で handle_new_user が public.users と
-- user_subscriptions (free) を作るので、created_at と課金の状態は後から UPDATE する。
--   1 u_admin / 2 u_swim / 3 u_inactive (週外の行だけ) / 4 u_act1 / 5 u_act2 / 6 u_act3 /
--   7 u_act4 / 8 u_proxy (user_id だけに入り、created_by は別人) / 9 u_ms (マイルストーンだけ) /
--   10 u_attnull (チームのメンバー。トリガが作る未回答の出欠行だけ) / 14 u_answer (出欠の回答だけ) /
--   15 u_relay (リレー記録だけ) / 16 u_group (グループ作成だけ)
--   11-13 m1-m3 (メンバーシップ・出欠の境界) / 21-26 b1-b6 (登録日時の境界) /
--   31,32,34,35 c1,c2,c4,c5 (前週の登録 = コホート) / 36 n1 (コホートの1秒前) /
--   17 u_teamlog (チーム練習のログだけ。管理者の一括編集で週内に作り直された選手) /
--   18 u_rebuild (J 節でチーム練習のログを週内の時刻で作り直す選手) / 19 u_plog (個人練習のログだけ) /
--   37 c6 (コホート。7日以内の行動はチーム練習のログだけ) / 38 c7 (コホート。7日以内の行動は個人練習のログだけ) /
--   41-46 a1-a6 (app_daily_usage) / 51-69 s1-s19 (課金。s13 は W の初回集計の後で有料になる)
insert into auth.users (id, email)
select public.qa_u(n), 'qa-wr-' || n || '@example.test'
from unnest(array[1,2,3,4,5,6,7,8,9,10, 11,12,13,14,15,16,17,18,19, 21,22,23,24,25,26, 31,32,34,35,36,37,38,
                  41,42,43,44,45,46, 51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69]) as n;

update public.users set created_at = '2025-12-30 00:00:00+09'
where id in (select public.qa_u(n) from unnest(array[1,2,3,4,5,6,7,8,9,10, 11,12,13,14,15,16,17,18,19,
             41,42,43,44,45,46, 51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69]) as n);

update public.users u set created_at = v.ts from (values
  (21, timestamptz '2026-10-30 23:59:59+09'),  -- b1: S の1秒前 (週外。前週のコホートの最後)
  (22, timestamptz '2026-10-31 00:00:00+09'),  -- b2: S ちょうど (週内。コホート外)
  (23, timestamptz '2026-10-31 00:00:01+09'),  -- b3: S の1秒後 (週内)
  (24, timestamptz '2026-11-06 23:59:59+09'),  -- b4: E の1秒前 (週内)
  (25, timestamptz '2026-11-07 00:00:00+09'),  -- b5: E ちょうど (週外)
  (26, timestamptz '2026-11-07 00:00:01+09'),  -- b6: E の1秒後 (週外)
  (31, timestamptz '2026-10-24 00:00:00+09'),  -- c1: コホートの始端ちょうど
  (32, timestamptz '2026-10-26 10:00:00+09'),  -- c2
  (34, timestamptz '2026-10-28 12:00:00+09'),  -- c4
  (35, timestamptz '2026-10-27 09:00:00+09'),  -- c5
  (36, timestamptz '2026-10-23 23:59:59+09'),  -- n1: コホートの始端の1秒前 (コホート外)
  (37, timestamptz '2026-10-27 08:00:00+09'),  -- c6
  (38, timestamptz '2026-10-27 09:00:00+09')   -- c7
) as v(n, ts)
where u.id = public.qa_u(v.n);

-- チーム
insert into public.teams (id, name, invite_code, created_by, created_at) values
  (public.qa_e(101), 'QA WR Team1',  'QA-WR-T1',  public.qa_u(1), '2025-12-30 00:00:00+09'),
  (public.qa_e(102), 'QA WR TeamB0', 'QA-WR-TB0', public.qa_u(3), '2026-10-30 23:59:59+09'),
  (public.qa_e(103), 'QA WR TeamB1', 'QA-WR-TB1', public.qa_u(1), '2026-10-31 00:00:00+09'),
  (public.qa_e(104), 'QA WR TeamB2', 'QA-WR-TB2', public.qa_u(3), '2026-11-07 00:00:00+09'),
  (public.qa_e(105), 'QA WR Team2',  'QA-WR-T2',  public.qa_u(6), '2026-11-02 12:00:00+09');

-- 古い (週外の) 親。メンバーシップより先に作り、出欠の自動作成トリガを発火させない
insert into public.practices (id, user_id, created_by, team_id, date, created_at) values
  (public.qa_e(201), public.qa_u(1), null, null, '2025-12-30', '2025-12-30 00:00:00+09'),           -- P_old (個人)
  (public.qa_e(202), public.qa_u(1), public.qa_u(1), public.qa_e(101), '2025-12-30', '2025-12-30 00:00:00+09'); -- TP_old (チーム)

insert into public.competitions (id, user_id, created_by, team_id, title, date, created_at) values
  (public.qa_e(401), public.qa_u(1), null, null, 'QA WR C_old', '2025-12-30', '2025-12-30 00:00:00+09'),
  (public.qa_e(402), public.qa_u(1), public.qa_u(1), public.qa_e(101), 'QA WR TC_old', '2025-12-30', '2025-12-30 00:00:00+09');

insert into public.goals (id, user_id, style_id, target_time, created_at) values
  (public.qa_e(601), public.qa_u(1), 1, 30.00, '2025-12-30 00:00:00+09'),  -- G_old
  (public.qa_e(613), public.qa_u(9), 1, 30.00, '2025-12-30 00:00:00+09');  -- G_ms (u_ms の古い目標)

-- メンバーシップ (T1)
insert into public.team_memberships (team_id, user_id, role, status, is_active, joined_at, created_at) values
  (public.qa_e(101), public.qa_u(1),  'admin', 'approved', true,  '2025-12-30', '2025-12-30 00:00:00+09'),
  (public.qa_e(101), public.qa_u(10), 'user',  'approved', true,  '2025-12-30', '2025-12-30 00:00:00+09'),
  (public.qa_e(101), public.qa_u(2),  'user',  'approved', true,  '2026-11-02', '2026-11-02 12:00:00+09'),
  (public.qa_e(101), public.qa_u(5),  'user',  'pending',  false, null,         '2026-11-02 12:00:00+09'),
  (public.qa_e(101), public.qa_u(11), 'user',  'pending',  false, null,         '2026-10-30 23:59:59+09'),
  (public.qa_e(101), public.qa_u(12), 'user',  'pending',  false, null,         '2026-10-31 00:00:00+09'),
  (public.qa_e(101), public.qa_u(13), 'user',  'pending',  false, null,         '2026-11-07 00:00:00+09'),
  -- b1 (コホート) が登録の約3日半後・週内に加入申請
  (public.qa_e(101), public.qa_u(21), 'user',  'pending',  false, null,         '2026-11-03 12:00:00+09');

-- 出欠の回答 (TP_old)。行は古く作られ、回答 (UPDATE) で updated_at が週の境界・週内になったものとして置く。
-- 数えるのは status IS NOT NULL かつ updated_at が週内の行 (created_at ではない)
insert into public.team_attendance (practice_id, user_id, status, created_at, updated_at) values
  (public.qa_e(202), public.qa_u(11), 'present', '2025-12-30 00:00:00+09', '2026-10-30 23:59:59+09'), -- m1 週外
  (public.qa_e(202), public.qa_u(12), 'present', '2025-12-30 00:00:00+09', '2026-10-31 00:00:00+09'), -- m2 週内
  (public.qa_e(202), public.qa_u(13), 'present', '2025-12-30 00:00:00+09', '2026-11-07 00:00:00+09'), -- m3 週外
  (public.qa_e(202), public.qa_u(2),  'absent',  '2025-12-30 00:00:00+09', '2026-11-02 12:00:00+09'), -- u_swim 週内
  (public.qa_e(202), public.qa_u(14), 'other',   '2025-12-30 00:00:00+09', '2026-11-03 12:00:00+09'); -- u_answer 週内 (回答だけでアクティブ)

-- 練習 (週内・境界)
--   team の行はトリガで u_admin / u_swim の出欠行が now() で作られる (週外なので数えない)
insert into public.practices (id, user_id, created_by, team_id, date, image_paths, created_at) values
  (public.qa_e(203), public.qa_u(3), null, null, '2026-10-30', '[]', '2026-10-30 23:59:59+09'),       -- PB0 週外
  (public.qa_e(204), public.qa_u(1), null, null, '2026-10-31', '[]', '2026-10-31 00:00:00+09'),       -- PB1 週内
  (public.qa_e(205), public.qa_u(3), null, null, '2026-11-07', '[]', '2026-11-07 00:00:00+09'),       -- PB2 週外
  (public.qa_e(206), public.qa_u(4), public.qa_u(4), null, '2026-11-02', '["qa/wr/a.jpg"]', '2026-11-02 12:00:00+09'), -- PP1 画像あり
  (public.qa_e(207), public.qa_u(1), null, null, '2026-11-02', '[]', '2026-11-02 12:00:00+09'),       -- PP2 空配列
  (public.qa_e(208), public.qa_u(1), null, null, '2026-11-02', null, '2026-11-02 12:00:00+09'),       -- PP3 NULL
  (public.qa_e(209), public.qa_u(7), null, null, '2026-11-02', '[]', '2026-11-02 12:00:00+09'),       -- PP4 created_by NULL → 作成者は user_id
  (public.qa_e(210), public.qa_u(1), public.qa_u(1), public.qa_e(101), '2026-11-02', '[]', '2026-11-02 12:00:00+09'), -- TP1 ログあり
  (public.qa_e(211), public.qa_u(1), null, public.qa_e(101), '2026-11-02', '[]', '2026-11-02 12:00:00+09'),           -- TP2 ログなし
  (public.qa_e(212), public.qa_u(8), public.qa_u(1), public.qa_e(101), '2026-11-02', '["qa/wr/t.jpg"]', '2026-11-02 12:00:00+09'), -- TP3 作成者は created_by (u_admin)
  (public.qa_e(217), public.qa_u(1), public.qa_u(1), public.qa_e(101), '2026-11-03', '[]', '2026-11-03 09:00:00+09'), -- TP4 出欠の自動作成用 (ログなし)
  -- コホート
  (public.qa_e(213), public.qa_u(31), null, null, '2026-10-25', '[]', '2026-10-25 00:00:00+09'),     -- c1: 登録1日後
  (public.qa_e(214), public.qa_u(36), null, null, '2026-10-24', '[]', '2026-10-24 12:00:00+09'),     -- n1 (コホート外)
  (public.qa_e(215), public.qa_u(35), null, null, '2026-10-27', '[]', '2026-10-27 12:00:00+09'),     -- c5: 登録3時間後
  (public.qa_e(216), public.qa_u(34), null, null, '2026-11-04', '[]', '2026-11-04 12:00:00+09');     -- c4: 登録のちょうど7日後 (窓の外。週内)

-- TP4 の作成でトリガ (create_attendance_for_team_practice) がアクティブなメンバー
-- (u_admin, u_swim, u_attnull) の未回答 (status NULL) の行を作る。実際の運用では練習の作成と同時刻なので、
-- created_at / updated_at を TP4 の作成時刻 (週内) にそろえる。UPDATE で updated_at を now() に
-- 書き換えるトリガは、この UPDATE の間だけ止める (rollback で戻る)
alter table public.team_attendance disable trigger update_team_attendance_updated_at;
update public.team_attendance set created_at = '2026-11-03 09:00:00+09', updated_at = '2026-11-03 09:00:00+09'
where practice_id = public.qa_e(217);
alter table public.team_attendance enable trigger update_team_attendance_updated_at;

-- 週内に作られ、週の後に回答された行 (m1 は TP1 のメンバーでないのでトリガ行が無い)。
-- created_at で数えると入り、回答の時刻 (updated_at) で数えると入らない
insert into public.team_attendance (practice_id, user_id, status, created_at, updated_at) values
  (public.qa_e(210), public.qa_u(11), 'present', '2026-11-02 12:00:00+09', '2026-11-07 00:00:00+09');

-- 練習ログ
insert into public.practice_logs (id, user_id, practice_id, style, rep_count, set_count, distance, created_at) values
  (public.qa_e(301), public.qa_u(3), public.qa_e(201), 'Fr', 1, 1, 50, '2026-10-30 23:59:59+09'), -- LB0 週外
  (public.qa_e(302), public.qa_u(1), public.qa_e(201), 'Fr', 1, 1, 50, '2026-10-31 00:00:00+09'), -- LB1 週内 (親は古い個人練習)
  (public.qa_e(303), public.qa_u(3), public.qa_e(201), 'Fr', 1, 1, 50, '2026-11-07 00:00:00+09'), -- LB2 週外
  (public.qa_e(304), public.qa_u(4), public.qa_e(206), 'Fr', 1, 2, 50, '2026-11-02 12:00:00+09'), -- L1 個人・タイム2件
  (public.qa_e(305), public.qa_u(4), public.qa_e(206), 'Fr', 1, 1, 50, '2026-11-02 12:00:00+09'), -- L2 個人・タイム0件
  (public.qa_e(306), public.qa_u(2), public.qa_e(210), 'Fr', 1, 1, 50, '2026-11-02 12:00:00+09'), -- L3 チーム (TP1)・タイムあり
  (public.qa_e(307), public.qa_u(2), public.qa_e(210), 'Fr', 1, 1, 50, '2026-11-02 12:00:00+09'), -- L4 チーム (TP1)
  (public.qa_e(308), public.qa_u(1), public.qa_e(201), 'Fr', 1, 1, 50, '2026-11-02 12:00:00+09'), -- L5 個人 (古い親)・タイムあり
  (public.qa_e(309), public.qa_u(2), public.qa_e(202), 'Fr', 1, 1, 50, '2026-11-02 12:00:00+09'), -- L6 チーム (古い親 TP_old)
  (public.qa_e(310), public.qa_u(35), public.qa_e(215), 'Fr', 1, 1, 50, '2026-10-27 12:00:00+09'), -- c5 (前週)
  -- 管理者の一括編集 (replace_practice_logs) がチーム練習 TP1 のログを週内に作り直し、選手 u_teamlog の
  -- user_id で入った行。選手はアクティブに入らない (チーム練習は practices の作成者で数える)
  (public.qa_e(312), public.qa_u(17), public.qa_e(210), 'Fr', 1, 1, 50, '2026-11-03 18:00:00+09'),
  (public.qa_e(313), public.qa_u(19), public.qa_e(201), 'Fr', 1, 1, 50, '2026-11-04 08:00:00+09'), -- u_plog 個人練習のログだけ (週内)
  -- c6: 登録の約1日後、チーム練習 TP_old のログだけ (一括編集で作られた行)。動線の練習に入らない
  (public.qa_e(314), public.qa_u(37), public.qa_e(202), 'Fr', 1, 1, 50, '2026-10-28 10:00:00+09'),
  -- c7: 登録の1時間後、個人練習のログだけ。動線の練習に入る
  (public.qa_e(315), public.qa_u(38), public.qa_e(201), 'Fr', 1, 1, 50, '2026-10-27 10:00:00+09');

insert into public.practice_times (user_id, practice_log_id, rep_number, set_number, time) values
  (public.qa_u(4), public.qa_e(304), 1, 1, 30.10),
  (public.qa_u(4), public.qa_e(304), 1, 2, 30.20),
  (public.qa_u(2), public.qa_e(306), 1, 1, 31.00),
  (public.qa_u(1), public.qa_e(308), 1, 1, 32.00);

insert into public.practice_tags (user_id, name, created_at) values
  (public.qa_u(3), 'qa-wr-tag-b0', '2026-10-30 23:59:59+09'),
  (public.qa_u(1), 'qa-wr-tag-b1', '2026-10-31 00:00:00+09'),
  (public.qa_u(3), 'qa-wr-tag-b2', '2026-11-07 00:00:00+09'),
  (public.qa_u(4), 'qa-wr-tag-m',  '2026-11-02 12:00:00+09');

insert into public.practice_log_templates (user_id, name, style, created_at) values
  (public.qa_u(3), 'qa-wr-tmpl-b0', 'Fr', '2026-10-30 23:59:59+09'),
  (public.qa_u(1), 'qa-wr-tmpl-b1', 'Fr', '2026-10-31 00:00:00+09'),
  (public.qa_u(3), 'qa-wr-tmpl-b2', 'Fr', '2026-11-07 00:00:00+09');

-- 大会
insert into public.competitions (id, user_id, created_by, team_id, title, date, created_at) values
  (public.qa_e(403), public.qa_u(3),  null, null, 'QA WR CB0', '2026-10-30', '2026-10-30 23:59:59+09'),
  (public.qa_e(404), public.qa_u(1),  null, null, 'QA WR CB1', '2026-10-31', '2026-10-31 00:00:00+09'),
  (public.qa_e(405), public.qa_u(3),  null, null, 'QA WR CB2', '2026-11-07', '2026-11-07 00:00:00+09'),
  (public.qa_e(406), public.qa_u(1),  null, null, 'QA WR PC1', '2026-11-02', '2026-11-02 12:00:00+09'),
  -- c2: 登録 (10-26 10:00) の 6日23時間59分59秒後 = 窓の内側の端。週内
  (public.qa_e(407), public.qa_u(32), null, null, 'QA WR c2',  '2026-11-02', '2026-11-02 09:59:59+09'),
  (public.qa_e(408), public.qa_u(1),  public.qa_u(1), public.qa_e(101), 'QA WR TC1', '2026-11-02', '2026-11-02 12:00:00+09');

insert into public.entries (user_id, team_id, competition_id, style_id, created_at) values
  (public.qa_u(3),  null, public.qa_e(401), 1, '2026-10-30 23:59:59+09'),
  (public.qa_u(1),  null, public.qa_e(401), 1, '2026-10-31 00:00:00+09'),
  (public.qa_u(3),  null, public.qa_e(401), 2, '2026-11-07 00:00:00+09'),
  (public.qa_u(1),  null, public.qa_e(401), 2, '2026-11-02 12:00:00+09'),             -- PE1
  (public.qa_u(2),  public.qa_e(101), public.qa_e(402), 1, '2026-11-02 12:00:00+09'), -- TE1
  (public.qa_u(2),  public.qa_e(101), public.qa_e(402), 2, '2026-11-02 12:00:00+09'), -- TE2
  (public.qa_u(35), null, public.qa_e(401), 3, '2026-10-27 10:00:00+09');            -- c5 (前週)

insert into public.records (id, user_id, team_id, competition_id, style_id, time, pool_type, video_path, created_at) values
  (public.qa_e(501), public.qa_u(3),  null, public.qa_e(401), 1, 30.00, 0, null, '2026-10-30 23:59:59+09'),
  (public.qa_e(502), public.qa_u(1),  null, public.qa_e(401), 1, 30.00, 0, null, '2026-10-31 00:00:00+09'),
  (public.qa_e(503), public.qa_u(3),  null, public.qa_e(401), 1, 30.00, 0, null, '2026-11-07 00:00:00+09'),
  (public.qa_e(504), public.qa_u(1),  null, public.qa_e(401), 2, 60.00, 0, 'qa/wr/v1.mp4', '2026-11-02 12:00:00+09'), -- PR1 動画・ラップ2
  (public.qa_e(505), public.qa_u(1),  null, public.qa_e(401), 2, 61.00, 0, '',             '2026-11-02 12:00:00+09'), -- PR2 空文字
  (public.qa_e(506), public.qa_u(1),  null, public.qa_e(401), 2, 62.00, 0, null,           '2026-11-02 12:00:00+09'), -- PR3 NULL・ラップ1
  (public.qa_e(507), public.qa_u(2),  public.qa_e(101), public.qa_e(402), 2, 63.00, 0, 'qa/wr/t1.mp4', '2026-11-02 12:00:00+09'), -- TR1 ラップ2
  (public.qa_e(508), public.qa_u(2),  public.qa_e(101), public.qa_e(402), 2, 64.00, 0, null,           '2026-11-02 12:00:00+09'), -- TR2
  (public.qa_e(509), public.qa_u(35), null, public.qa_e(401), 3, 65.00, 0, null, '2026-10-27 11:00:00+09'); -- c5 (前週)

insert into public.split_times (record_id, distance, split_time) values
  (public.qa_e(504), 25, 28.00), (public.qa_e(504), 50, 59.00),
  (public.qa_e(506), 25, 29.00),
  (public.qa_e(507), 25, 30.00), (public.qa_e(507), 50, 62.00);

insert into public.relay_records (team_id, relay_kind, leg_distance, pool_type, gender_category, total_time, created_by, created_at) values
  (public.qa_e(101), 'free', 50, 0, 'male', 100.00, public.qa_u(3), '2026-10-30 23:59:59+09'),
  (public.qa_e(101), 'free', 50, 0, 'male', 100.00, public.qa_u(1), '2026-10-31 00:00:00+09'),
  (public.qa_e(101), 'free', 50, 0, 'male', 100.00, public.qa_u(3), '2026-11-07 00:00:00+09'),
  (public.qa_e(101), 'free', 50, 0, 'male', 100.00, public.qa_u(1), '2026-11-02 12:00:00+09'),
  (public.qa_e(101), 'free', 50, 0, 'male', 101.00, public.qa_u(15), '2026-11-03 12:00:00+09'); -- u_relay

insert into public.announcements (team_id, title, content, created_by, created_at) values
  (public.qa_e(101), 'qa-wr-b0', 'x', public.qa_u(3), '2026-10-30 23:59:59+09'),
  (public.qa_e(101), 'qa-wr-b1', 'x', public.qa_u(1), '2026-10-31 00:00:00+09'),
  (public.qa_e(101), 'qa-wr-b2', 'x', public.qa_u(3), '2026-11-07 00:00:00+09'),
  (public.qa_e(101), 'qa-wr-m',  'x', public.qa_u(1), '2026-11-02 12:00:00+09');

insert into public.team_groups (team_id, name, created_by, created_at) values
  (public.qa_e(101), 'qa-wr-group-b0', public.qa_u(3), '2026-10-30 23:59:59+09'),
  (public.qa_e(101), 'qa-wr-group-b1', public.qa_u(1), '2026-10-31 00:00:00+09'),
  (public.qa_e(101), 'qa-wr-group-b2', public.qa_u(3), '2026-11-07 00:00:00+09'),
  (public.qa_e(101), 'qa-wr-group-m',  public.qa_u(1), '2026-11-02 12:00:00+09'),
  (public.qa_e(101), 'qa-wr-group-g',  public.qa_u(16), '2026-11-03 12:00:00+09'); -- u_group

-- 目標 (goals の UNIQUE (user_id, competition_id, style_id) を避けるため style を分ける)
insert into public.goals (id, user_id, style_id, target_time, status, achieved_at, created_at) values
  (public.qa_e(602), public.qa_u(3),  1, 30.00, 'active',   null, '2026-10-30 23:59:59+09'), -- GoB0 週外
  (public.qa_e(603), public.qa_u(1),  2, 30.00, 'active',   null, '2026-10-31 00:00:00+09'), -- GoB1 週内
  (public.qa_e(604), public.qa_u(3),  2, 30.00, 'active',   null, '2026-11-07 00:00:00+09'), -- GoB2 週外
  (public.qa_e(605), public.qa_u(4),  1, 30.00, 'achieved', '2026-11-02 12:00:00+09', '2026-11-02 12:00:00+09'), -- G1 作成・達成とも週内
  (public.qa_e(606), public.qa_u(1),  3, 30.00, 'active',   null, '2026-11-02 12:00:00+09'), -- G2
  (public.qa_e(607), public.qa_u(32), 1, 30.00, 'active',   null, '2026-11-02 10:00:00+09'), -- c2: 登録のちょうど7日後 (窓の外。週内)
  (public.qa_e(608), public.qa_u(22), 1, 30.00, 'active',   null, '2026-10-31 01:00:00+09'), -- b2 (コホート外。週内)
  (public.qa_e(609), public.qa_u(31), 1, 30.00, 'active',   null, '2026-10-30 00:00:00+09'), -- c1: 登録6日後 (週外)
  (public.qa_e(610), public.qa_u(1),  4, 30.00, 'achieved', '2026-10-30 23:59:59+09', '2025-12-30 00:00:00+09'), -- GaB0
  (public.qa_e(611), public.qa_u(1),  5, 30.00, 'achieved', '2026-10-31 00:00:00+09', '2025-12-30 00:00:00+09'), -- GaB1
  (public.qa_e(612), public.qa_u(1),  6, 30.00, 'achieved', '2026-11-07 00:00:00+09', '2025-12-30 00:00:00+09'); -- GaB2

insert into public.milestones (goal_id, title, type, params, status, achieved_at, created_at) values
  (public.qa_e(601), 'qa-wr-mb0', 'other',     '{}', 'not_started', null, '2026-10-30 23:59:59+09'),
  (public.qa_e(601), 'qa-wr-mb1', 'other',     '{}', 'not_started', null, '2026-10-31 00:00:00+09'),
  (public.qa_e(601), 'qa-wr-mb2', 'other',     '{}', 'not_started', null, '2026-11-07 00:00:00+09'),
  (public.qa_e(605), 'qa-wr-m1',  'time',      '{}', 'not_started', null, '2026-11-02 12:00:00+09'),
  (public.qa_e(605), 'qa-wr-m2',  'time',      '{}', 'not_started', null, '2026-11-02 12:00:00+09'),
  (public.qa_e(605), 'qa-wr-m3',  'reps_time', '{}', 'achieved', '2026-11-03 12:00:00+09', '2026-11-02 12:00:00+09'),
  (public.qa_e(613), 'qa-wr-ms',  'set',       '{}', 'not_started', null, '2026-11-02 12:00:00+09'), -- u_ms は目標が古く、マイルストーンだけ週内
  (public.qa_e(601), 'qa-wr-ma0', 'set',       '{}', 'achieved', '2026-10-30 23:59:59+09', '2025-12-30 00:00:00+09'),
  (public.qa_e(601), 'qa-wr-ma1', 'set',       '{}', 'achieved', '2026-10-31 00:00:00+09', '2025-12-30 00:00:00+09'),
  (public.qa_e(601), 'qa-wr-ma2', 'set',       '{}', 'achieved', '2026-11-07 00:00:00+09', '2025-12-30 00:00:00+09');

-- type は CHECK 制約で4種類に絞られているが、仕様は「固定で列挙せず動的に出す」。
-- 将来の種類が増えたときにキーが出ることを、制約を一時的に外して確かめる (rollback で戻る)
alter table public.milestones drop constraint milestones_type_check;
insert into public.milestones (goal_id, title, type, params, status, created_at) values
  (public.qa_e(605), 'qa-wr-mq', 'qa_future_type', '{}', 'not_started', '2026-11-02 12:00:00+09');

-- Scanner / Timer
insert into public.token_consumption_log (user_id, app, token_source, action_type, created_at) values
  (public.qa_u(1), 'swimhub_scanner', 'daily_free', 'scanner_scan',           '2026-10-30 23:59:59+09'),
  (public.qa_u(1), 'swimhub_scanner', 'daily_free', 'scanner_scan',           '2026-10-31 00:00:00+09'),
  (public.qa_u(1), 'swimhub_scanner', 'daily_free', 'scanner_scan',           '2026-11-07 00:00:00+09'),
  (public.qa_u(1), 'swimhub',         'purchased',  'swimhub_image_analysis', '2026-11-02 12:00:00+09'),
  (public.qa_u(4), 'swimhub',         'daily_free', 'swimhub_image_analysis', '2026-11-03 12:00:00+09'),
  (public.qa_u(46), 'swimhub',        'daily_free', 'swimhub_image_analysis', '2026-11-03 13:00:00+09'); -- a6: アクティブユーザーには入らない

-- usage_date は JST の日付。週は 2026-10-31 (土) 〜 2026-11-06 (金)
insert into public.app_daily_usage (user_id, app, usage_date, usage_count) values
  (public.qa_u(41), 'swimhub_timer',   '2026-10-30', 1),  -- a1: 前の金曜 (週外)
  (public.qa_u(42), 'swimhub_timer',   '2026-10-31', 1),  -- a2: 土曜 (週内)
  (public.qa_u(42), 'swimhub_timer',   '2026-11-03', 3),  -- a2: 同じ人の別の日 (重複なし)
  (public.qa_u(43), 'swimhub_timer',   '2026-11-06', 2),  -- a3: 金曜 (週内)
  (public.qa_u(44), 'swimhub_timer',   '2026-11-07', 1),  -- a4: 次の土曜 (週外)
  (public.qa_u(45), 'swimhub_timer',   '2026-11-02', 0),  -- a5: usage_count = 0 (数えない)
  (public.qa_u(46), 'swimhub_scanner', '2026-11-01', 1);  -- a6: scanner

insert into public.guest_scan_daily_usage (ip_hash, usage_date, count) values
  ('qa-wr-ip-1', '2026-10-30', 5),  -- 週外
  ('qa-wr-ip-1', '2026-10-31', 2),
  ('qa-wr-ip-2', '2026-11-06', 3),
  ('qa-wr-ip-1', '2026-11-06', 1),
  ('qa-wr-ip-3', '2026-11-07', 7);  -- 週外

insert into public.contact_messages (name, email, subject, message, created_at) values
  ('qa', 'qa-wr@example.test', 'b0', 'x', '2026-10-30 23:59:59+09'),
  ('qa', 'qa-wr@example.test', 'b1', 'x', '2026-10-31 00:00:00+09'),
  ('qa', 'qa-wr@example.test', 'b2', 'x', '2026-11-07 00:00:00+09'),
  ('qa', 'qa-wr@example.test', 'm',  'x', '2026-11-02 12:00:00+09');

-- -----------------------------------------------------------------------------
-- 課金: 状態 A (前週 P のスナップショット時点)
--   s1 stripe 本番 / s2 revenucat 環境 NULL (= 本番扱い) / s3 revenucat 本番 (→ W で終了) /
--   s4 stripe 本番 (→ W で解約予約) / s5 revenucat canceled (A から解約予約中) /
--   s6, s7, s9, s11 は free / s8 revenucat sandbox / s10 revenucat sandbox (→ W で終了) /
--   s12 provider NULL (→ キーは unknown)・premium_expires_at NULL (期限なしも有料会員) /
--   s11 は W で provider NULL の有料になる / s9 は W で sandbox の trialing になる (billing.trialing に入らない)
--   P の前週 (10-17) は保存行だけがありスナップショットは0行 = 「前週の premium 0 人」で比較あり
--   有料会員の対象外 (A・B とも): s14 stripe past_due (billing.past_due に入る) /
--   s15 revenucat active だが premium_expires_at が過去 (失効の webhook の取りこぼし) /
--   s17 revenucat active で premium_expires_at = 集計時刻ちょうど / s18 revenucat sandbox past_due
--   s19 revenucat active (A は期限内、B では期限が過ぎたまま premium で残る → 有料終了) /
--   s16 は W で stripe の trialing になる (新規有料に入り、billing.trialing に入る)
--   期限は実行日に追従させる (now() 基準。now() はトランザクション開始時刻で、集計の間は変わらない)
-- -----------------------------------------------------------------------------
update public.user_subscriptions us set
  plan = 'premium', status = v.status, provider = v.provider,
  provider_environment = v.env, cancel_at_period_end = v.cape,
  premium_expires_at = now() + interval '30 days'
from (values
  (51, 'active',   'stripe',    'production', false),
  (52, 'active',   'revenucat', null,         false),
  (53, 'active',   'revenucat', 'production', false),
  (54, 'active',   'stripe',    'production', false),
  (55, 'canceled', 'revenucat', 'production', false),
  (58, 'active',   'revenucat', 'sandbox',    false),
  (60, 'active',   'revenucat', 'sandbox',    false),
  (62, 'active',   null,        null,         false),
  (69, 'active',   'revenucat', 'production', false)
) as v(n, status, provider, env, cape)
where us.id = public.qa_u(v.n);
update public.user_subscriptions us set
  plan = 'premium', status = v.status, provider = v.provider,
  provider_environment = v.env, cancel_at_period_end = false, premium_expires_at = v.expires
from (values
  (62, 'active',   null,        null,         null::timestamptz),
  (64, 'past_due', 'stripe',    'production', now() + interval '30 days'),
  (65, 'active',   'revenucat', 'production', now() - interval '1 day'),
  (67, 'active',   'revenucat', 'production', now()),
  (68, 'past_due', 'revenucat', 'sandbox',    now() + interval '30 days')
) as v(n, status, provider, env, expires)
where us.id = public.qa_u(v.n);

insert into qa_runs select 'p1', public.generate_weekly_usage_report('2026-10-24');

-- 課金: 状態 B (W のスナップショット時点)
update public.user_subscriptions set plan = 'free', status = 'expired'
where id in (public.qa_u(53), public.qa_u(60));
update public.user_subscriptions set cancel_at_period_end = true where id = public.qa_u(54);
update public.user_subscriptions us set
  plan = 'premium', status = v.status, provider = v.provider,
  provider_environment = v.env, cancel_at_period_end = v.cape,
  premium_expires_at = now() + interval '30 days'
from (values
  (56, 'active',   'revenucat', 'production', false),
  (57, 'active',   'stripe',    'production', true),
  (59, 'trialing', 'revenucat', 'sandbox',    false),
  (61, 'active',   null,        null,         false),
  (66, 'trialing', 'stripe',    'production', false)
) as v(n, status, provider, env, cape)
where us.id = public.qa_u(v.n);
-- s19: plan / status は premium / active のまま、期限だけが過ぎた
update public.user_subscriptions set premium_expires_at = now() - interval '1 hour' where id = public.qa_u(69);

insert into qa_runs select 'w1', public.generate_weekly_usage_report('2026-10-31');

-- =============================================================================
-- A. 返り値の形と保存行
-- =============================================================================
select ok(
  (select result ?& array['week_start','period_start','period_end','generated_at','metrics',
                          'uncategorized_tables','email_sent_at','previous_metrics','previous_email_sent_at']
   from qa_runs where label = 'w1'),
  'A-1: 返り値の jsonb に契約のキーが全てある');

select is((select result->>'week_start' from qa_runs where label = 'w1'), '2026-10-31',
  'A-2: week_start は対象週の土曜 (JST の日付)');

select is((select (result->>'period_start')::timestamptz from qa_runs where label = 'w1'),
  timestamptz '2026-10-31 00:00:00+09',
  'A-3: period_start は土曜 00:00 JST');

select is((select (result->>'period_end')::timestamptz from qa_runs where label = 'w1'),
  timestamptz '2026-11-07 00:00:00+09',
  'A-4: period_end は翌週の土曜 00:00 JST');

select is(
  (select row(period_start, period_end)::text from public.weekly_usage_reports where week_start = '2026-10-31'),
  row(timestamptz '2026-10-31 00:00:00+09', timestamptz '2026-11-07 00:00:00+09')::text,
  'A-5: 保存行の period_start / period_end も同じ');

select is(
  (select metrics from public.weekly_usage_reports where week_start = '2026-10-31'),
  (select result->'metrics' from qa_runs where label = 'w1'),
  'A-6: 保存行の metrics は返り値の metrics と同じ');

select ok(
  (select generated_at is not null from public.weekly_usage_reports where week_start = '2026-10-31'),
  'A-7: generated_at が入る');

select is(
  (select count(*)::int from jsonb_each((select result->'metrics' from qa_runs where label = 'w1'))
   where jsonb_typeof(value) <> 'number'),
  0,
  'A-8: metrics は flat で、値は全て数値');

-- 値が 0 でも静的なキーは出す (出さないと 0 → N の週に「新規指標」と表示されてしまう)
select ok(
  (select result->'metrics' ?& array[
     'account.users_new','account.active_users',
     'practice.personal_practices','practice.personal_practices_with_image','practice.personal_logs',
     'practice.personal_logs_with_times','practice.tags','practice.log_templates',
     'competition.personal_competitions','competition.personal_entries','competition.personal_records',
     'competition.personal_records_with_video','competition.personal_records_with_splits',
     'team.teams','team.memberships_new','team.memberships_approved','team.practices','team.practices_with_logs',
     'team.competitions','team.entries','team.records','team.records_with_splits','team.relay_records',
     'team.attendance','team.announcements','team.groups',
     'goal.created','goal.achieved','goal.milestones_achieved',
     'billing.cancel_pending','billing.sandbox_premium_total','billing.new_cancel_pending','billing.churned',
     'billing.trialing','billing.past_due',
     'guest.scans','guest.unique_ips','support.contact_messages',
     'funnel.cohort_size','funnel.practice','funnel.competition','funnel.team','funnel.goal']
   from qa_runs where label = 'w1'),
  'A-9: 静的なキーは値が 0 でも全て metrics にある (前週スナップショットがある週は課金のフローのキーも)');

-- =============================================================================
-- B. 週の境界 (成功条件 1)。各テーブルとも S の1秒前・S ちょうど・E ちょうど の3行のうち1行だけ
-- =============================================================================
select is(pg_temp.qa_delta('w1', 'account.users_new'), 3::numeric,
  'B-1: users の境界: S-1s と E・E+1s は数えず、S・S+1s・E-1s の3人だけ');
select is(pg_temp.qa_delta('w1', 'practice.tags'), 2::numeric,
  'B-2: practice_tags: 境界の1件 + 週内1件');
select is(pg_temp.qa_delta('w1', 'practice.log_templates'), 1::numeric,
  'B-3: practice_log_templates: 境界の1件だけ');
select is(pg_temp.qa_delta('w1', 'team.teams'), 2::numeric,
  'B-4: teams: 境界の1件 + 週内1件');
select is(pg_temp.qa_delta('w1', 'team.relay_records'), 3::numeric,
  'B-5: relay_records: 境界の1件 + 週内2件');
select is(pg_temp.qa_delta('w1', 'team.announcements'), 2::numeric,
  'B-6: announcements: 境界の1件 + 週内1件');
select is(pg_temp.qa_delta('w1', 'team.groups'), 3::numeric,
  'B-7: team_groups: 境界の1件 + 週内2件');
select is(
  (select count(*)::int from public.team_attendance
   where practice_id = public.qa_e(217) and status is null
     and updated_at >= '2026-10-31 00:00:00+09' and updated_at < '2026-11-07 00:00:00+09'),
  3,
  'B-8a: (前提) TP4 の作成でトリガが作った未回答の出欠行が3件、週内の時刻で存在する');
select is(pg_temp.qa_delta('w1', 'team.attendance'), 3::numeric,
  'B-8: 出欠回答: status があり updated_at が週内の3件 (m2 = 境界, u_swim, u_answer)。行の created_at は週外で、トリガが作った未回答の3件は数えない');
select is(pg_temp.qa_delta('w1', 'goal.achieved'), 2::numeric,
  'B-9: goals.achieved_at の境界: 1件 + 週内に達成した G1');
select is(pg_temp.qa_delta('w1', 'goal.milestones_achieved'), 2::numeric,
  'B-10: milestones.achieved_at の境界: 1件 + 週内に達成した1件');
select is(pg_temp.qa_delta('w1', 'token.swimhub_scanner.scanner_scan'), 1::numeric,
  'B-11: token_consumption_log の境界: 1件だけ (app.action_type 別のキー)');
select is(pg_temp.qa_delta('w1', 'token.swimhub.swimhub_image_analysis'), 3::numeric,
  'B-12: token_consumption_log: swimhub の画像解析は週内3件');
select is(pg_temp.qa_delta('w1', 'support.contact_messages'), 2::numeric,
  'B-13: contact_messages: 境界の1件 + 週内1件');

-- =============================================================================
-- C. 日付の列 (成功条件 2)
-- =============================================================================
select is(pg_temp.qa_delta('w1', 'usage.swimhub_timer.active_users'), 2::numeric,
  'C-1: app_daily_usage: 土曜と金曜は週内・前の金曜と次の土曜・usage_count=0 は数えず、同じ人は1人');
select is(pg_temp.qa_delta('w1', 'usage.swimhub_scanner.active_users'), 1::numeric,
  'C-2: app_daily_usage: app 別にキーが分かれる');
select is(pg_temp.qa_delta('w1', 'guest.scans'), 6::numeric,
  'C-3: guest_scan_daily_usage: 週内の count の合計 (2 + 3 + 1)');
select is(pg_temp.qa_delta('w1', 'guest.unique_ips'), 2::numeric,
  'C-4: guest_scan_daily_usage: 週内の distinct ip_hash');

-- =============================================================================
-- D. 個人とチームの分割 (成功条件 3) と「〜付き」の除外 (成功条件 4)
-- =============================================================================
select is(pg_temp.qa_delta('w1', 'practice.personal_practices'), 6::numeric,
  'D-1: 個人の練習: 境界1 + PP1〜PP4 + c4 (週内) = 6。チーム練習は入らない');
select is(pg_temp.qa_delta('w1', 'practice.personal_practices_with_image'), 1::numeric,
  'D-2: 画像付き: 空配列と NULL は除き、PP1 だけ (チームの TP3 の画像は入らない)');
select is(pg_temp.qa_delta('w1', 'practice.personal_logs'), 5::numeric,
  'D-3: 個人のログ: 親の team_id で判定 (古い個人練習のログ・u_plog は入り、古いチーム練習のログ・一括編集で作り直されたチーム練習のログは入らない)');
select is(pg_temp.qa_delta('w1', 'practice.personal_logs_with_times'), 2::numeric,
  'D-4: タイム付き: タイム0件のログを除き、タイムの行数ではなくログの件数 (L1, L5)');
select is(pg_temp.qa_delta('w1', 'team.practices'), 4::numeric,
  'D-5: チーム練習: TP1〜TP4');
select is(pg_temp.qa_delta('w1', 'team.practices_with_logs'), 1::numeric,
  'D-6: ログ付きのチーム練習: ログの件数ではなく練習の件数 (TP1 だけ)');
select is(pg_temp.qa_delta('w1', 'competition.personal_competitions'), 3::numeric,
  'D-7: 個人の大会: 境界1 + PC1 + c2 = 3。チーム大会は入らない');
select is(pg_temp.qa_delta('w1', 'team.competitions'), 1::numeric,
  'D-8: チーム大会: TC1');
select is(pg_temp.qa_delta('w1', 'competition.personal_entries'), 2::numeric,
  'D-9: 個人のエントリー: 境界1 + PE1');
select is(pg_temp.qa_delta('w1', 'team.entries'), 2::numeric,
  'D-10: チームのエントリー: TE1, TE2');
select is(pg_temp.qa_delta('w1', 'competition.personal_records'), 4::numeric,
  'D-11: 個人のレコード: 境界1 + PR1〜PR3');
select is(pg_temp.qa_delta('w1', 'competition.personal_records_with_video'), 1::numeric,
  'D-12: 動画付き: 空文字と NULL を除き PR1 だけ (チームの TR1 の動画は入らない)');
select is(pg_temp.qa_delta('w1', 'competition.personal_records_with_splits'), 2::numeric,
  'D-13: ラップ付き (個人): ラップの行数ではなくレコードの件数 (PR1, PR3)');
select is(pg_temp.qa_delta('w1', 'team.records'), 2::numeric,
  'D-14: チームの記録: TR1, TR2');
select is(pg_temp.qa_delta('w1', 'team.records_with_splits'), 1::numeric,
  'D-15: ラップ付き (チーム): TR1 だけ');
select is(pg_temp.qa_delta('w1', 'team.memberships_new'), 4::numeric,
  'D-16: チーム加入: 申請・招待 (pending) を含む。境界1 (m2) + u_swim + u_act2 + b1');
select is(pg_temp.qa_delta('w1', 'team.memberships_approved'), 1::numeric,
  'D-17: うち承認済み: u_swim だけ');

-- =============================================================================
-- E. 目標とマイルストーン (成功条件 7)
-- =============================================================================
select is(pg_temp.qa_delta('w1', 'goal.created'), 5::numeric,
  'E-1: 目標設定: 境界1 + G1 + G2 + c2 + b2');
select is(pg_temp.qa_delta('w1', 'goal.milestones_created.time'), 2::numeric,
  'E-2: マイルストーン設定 (time) は2件');
select is(pg_temp.qa_delta('w1', 'goal.milestones_created.reps_time'), 1::numeric,
  'E-3: マイルストーン設定 (reps_time) は1件');
select is(pg_temp.qa_delta('w1', 'goal.milestones_created.other'), 1::numeric,
  'E-4: マイルストーン設定 (other) は境界の1件だけ');
select is(pg_temp.qa_delta('w1', 'goal.milestones_created.set'), 1::numeric,
  'E-5: マイルストーン設定 (set) は u_ms の1件 (古い set の3件は週外の作成)');
select is(pg_temp.qa_metric('w1', 'goal.milestones_created.qa_future_type'), 1::numeric,
  'E-6: CHECK に無い新しい type も、固定の列挙ではなく動的なキーで出る');
select ok(
  not ((select result->'metrics' from qa_runs where label = 'w1') ? 'goal.milestones_created'),
  'E-7: type の無い集約キー goal.milestones_created は作らない');

-- =============================================================================
-- F. アクティブユーザー (成功条件 6)
--   週内に作成系の行がある人: u_admin (10を超えるテーブル), u_act1 (練習・ログ・タグ・目標・
--   マイルストーン), u_act2 (加入申請), u_act3 (チーム作成), u_act4 (created_by NULL の練習),
--   u_swim (ログ・エントリー・記録・加入・出欠), m2 (加入・出欠), b1 (加入), b2 (目標),
--   c2 (大会・目標), c4 (練習), u_ms (マイルストーン → goals.user_id),
--   u_answer (出欠の回答だけ), u_relay (relay_records.created_by だけ), u_group (team_groups.created_by だけ),
--   u_plog (個人練習のログだけ) = 16人。u_teamlog (一括編集で週内に作り直されたチーム練習のログだけ) は入らない
--   入らない人: u_inactive (S-1s と E ちょうどの行だけ)、u_proxy (user_id だけで created_by は
--   u_admin の練習)、m1・m3 (境界の外)、u_attnull (トリガが作った未回答の出欠行だけ)、
--   a6 (AI 読み取りと app_daily_usage だけ)、a*・s*・新規登録だけの b3〜b6
-- =============================================================================
select is(pg_temp.qa_delta('w1', 'account.active_users'), 16::numeric,
  'F-1: アクティブユーザーは16人 (テーブルをまたいで重複なし。週外の行・created_by がある行の user_id・未回答の出欠・AI 読み取りの利用・チーム練習のログは数えない)');

-- =============================================================================
-- G. 動線のコホート (成功条件 9)
--   コホート = [2026-10-24 00:00, 2026-10-31 00:00) JST に登録: c1 (始端ちょうど), c2, c4, c5, c6, c7, b1 (終端の1秒前)
--   コホート外: n1 (始端の1秒前), b2 (終端ちょうど)
-- =============================================================================
select is(pg_temp.qa_delta('w1', 'funnel.cohort_size'), 7::numeric,
  'G-1: コホートは7人 (始端ちょうどは含み、終端ちょうどは含まない)');
select is(pg_temp.qa_delta('w1', 'funnel.practice'), 3::numeric,
  'G-2: 7日以内に練習: c1, c5 (練習とログの両方があっても1人), c7 (個人練習のログだけ)。c6 はチーム練習のログだけなので入らず、c4 はちょうど7日後で入らず、n1 はコホート外');
select is(pg_temp.qa_delta('w1', 'funnel.competition'), 2::numeric,
  'G-3: 7日以内に大会・記録: c2 (6日23時間59分59秒後) と c5 (エントリーと記録で1人)');
select is(pg_temp.qa_delta('w1', 'funnel.team'), 1::numeric,
  'G-4: 7日以内にチーム参加: b1 (週内の加入申請も数える)');
select is(pg_temp.qa_delta('w1', 'funnel.goal'), 1::numeric,
  'G-5: 7日以内に目標: c1 だけ。c2 はちょうど7日後で入らず、b2 はコホート外');

-- =============================================================================
-- H. 課金のスナップショット差分 (成功条件 8)
-- =============================================================================
select ok(
  not ((select result->'metrics' from qa_runs where label = 'w0') ?| array['billing.churned','billing.new_cancel_pending'])
  and not exists (select 1 from jsonb_object_keys((select result->'metrics' from qa_runs where label = 'w0')) k
                  where k like 'billing.new_premium.%'),
  'H-1: 前週 (P) の保存行が無い週はフローの指標 (new_* と churned) を出さない');
select ok(
  (select result->'metrics' ?& array['billing.churned','billing.new_cancel_pending'] from qa_runs where label = 'p1')
  and pg_temp.qa_metric('p1', 'billing.churned') = 0
  and pg_temp.qa_metric('p1', 'billing.new_cancel_pending') = pg_temp.qa_metric('p1', 'billing.cancel_pending'),
  'H-1b: 前週 (10-17) の保存行があればスナップショットが0行 (premium 0 人) でも比較ありで、churned は 0');
select is(
  (select array_agg(k order by k) from jsonb_object_keys((select result->'metrics' from qa_runs where label = 'p1')) k
   where k like 'billing.new_premium.%'),
  (select array_agg('billing.new_premium.' || substr(k, length('billing.premium_total.') + 1) order by k)
   from jsonb_object_keys((select result->'metrics' from qa_runs where label = 'p1')) k
   where k like 'billing.premium_total.%'),
  'H-1c: 前週 premium 0 人なら、今週の有料は provider ごとに全員が新規有料');
select ok(
  (select bool_and(pg_temp.qa_metric('p1', k) = pg_temp.qa_metric('p1', replace(k, 'billing.premium_total.', 'billing.new_premium.')))
   from jsonb_object_keys((select result->'metrics' from qa_runs where label = 'p1')) k
   where k like 'billing.premium_total.%'),
  'H-1d: その件数は provider ごとの有料会員数と同じ');
select is(pg_temp.qa_delta('w1', 'billing.premium_total.stripe'), 4::numeric,
  'H-2: 有料会員数 (stripe): s1, s4, s7, s16 (trialing)。past_due の s14 は入らない');
select is(pg_temp.qa_delta('w1', 'billing.premium_total.revenucat'), 3::numeric,
  'H-3: 有料会員数 (revenucat): s2 (環境 NULL は本番扱い), s5 (canceled = 解約予約中), s6。sandbox の s8, s9、期限切れのまま残った s15・s19、期限が集計時刻ちょうどの s17 は入らない');
select is(pg_temp.qa_delta('w1', 'billing.premium_total.unknown'), 2::numeric,
  'H-3b: provider が NULL の有料はキーの末尾を unknown にする (s11, 期限なしの s12)');
select ok(
  not exists (select 1 from jsonb_object_keys((select result->'metrics' from qa_runs where label = 'w1')) k
              where k in ('billing.premium_total.', 'billing.new_premium.') or k like '%.null'),
  'H-3c: provider が NULL でも、末尾が空や null のキーは作らない');
select is(pg_temp.qa_delta('w1', 'billing.cancel_pending'), 3::numeric,
  'H-4: うち解約予約中: canceled の s5 と cancel_at_period_end の s4, s7');
select is(pg_temp.qa_delta('w1', 'billing.sandbox_premium_total'), 2::numeric,
  'H-5: sandbox の有料: s8, s9 (trialing)');
select is(pg_temp.qa_delta('w1', 'billing.new_premium.stripe'), 2::numeric,
  'H-6: 新規有料 (stripe): s7 と、トライアルを始めた s16');
select is(pg_temp.qa_delta('w1', 'billing.new_premium.revenucat'), 1::numeric,
  'H-7: 新規有料 (revenucat): s6 (sandbox で新しく有料になった s9 は入らない)');
select is(pg_temp.qa_delta('w1', 'billing.new_premium.unknown'), 1::numeric,
  'H-7b: 新規有料 (unknown): s11');
select is(pg_temp.qa_delta('w1', 'billing.new_cancel_pending'), 2::numeric,
  'H-8: 新規解約予約: 前週は解約予約でなかった s4 と、前週に無かった s7。前週から canceled の s5 は入らない');
select is(pg_temp.qa_delta('w1', 'billing.churned'), 2::numeric,
  'H-9: 有料終了: free になった s3 と、premium のまま期限が過ぎた s19 (sandbox から抜けた s10 は入らない)');
select is(pg_temp.qa_delta('w1', 'billing.trialing'), 1::numeric,
  'H-9b: うちトライアル中: 本番の trialing は s16 だけ (sandbox の trialing の s9 は入らない)');
select is(pg_temp.qa_delta('w1', 'billing.past_due'), 1::numeric,
  'H-9c: 支払い遅延: 本番の premium かつ past_due は s14 だけ (sandbox の s18 は入らない)');
select is(
  (select count(*)::int from public.user_subscription_snapshots
   where user_id in (public.qa_u(64), public.qa_u(65), public.qa_u(67), public.qa_u(68))),
  0,
  'H-9d: past_due (s14, s18)・期限切れ (s15)・期限が集計時刻ちょうど (s17) の行はどの週のスナップショットにも入らない');
select is(
  (select array_agg(week_start order by week_start) from public.user_subscription_snapshots where user_id = public.qa_u(69)),
  array['2026-10-24'::date],
  'H-9e: s19 は期限内だった P にだけ入り、期限が過ぎた W には入らない');
select is(
  (select count(*)::int from public.user_subscription_snapshots
   where week_start = '2026-10-24' and user_id in (select public.qa_u(n) from generate_series(51, 69) n)),
  9,
  'H-10: P のスナップショットには有料会員の行が sandbox も含めて入る (s1-s5, s8, s10, s12, s19)');
select is(
  (select count(*)::int from public.user_subscription_snapshots
   where week_start = '2026-10-31' and user_id in (select public.qa_u(n) from generate_series(51, 69) n)),
  11,
  'H-11: W のスナップショット (s1, s2, s4-s9, s11, s12, s16)');
select is(
  (select row(status, provider, cancel_at_period_end, provider_environment, premium_expires_at)::text
   from public.user_subscription_snapshots where week_start = '2026-10-31' and user_id = public.qa_u(54)),
  row('active'::text, 'stripe'::text, true, 'production'::text, now() + interval '30 days')::text,
  'H-12: スナップショットの列 (status, provider, cancel_at_period_end, provider_environment, premium_expires_at)');
select is(
  (select provider_environment from public.user_subscription_snapshots
   where week_start = '2026-10-31' and user_id = public.qa_u(52)),
  null,
  'H-13: provider_environment の NULL はスナップショットでも NULL のまま');

-- =============================================================================
-- I. 先週比に使う行 (成功条件 10)
-- =============================================================================
select is((select result->'previous_metrics' from qa_runs where label = 'w0'), 'null'::jsonb,
  'I-1: ちょうど7日前 (10-24) の行が無いとき previous_metrics は null (14日前の 10-17 の行は使わない)');
select is((select result->'previous_email_sent_at' from qa_runs where label = 'w0'), 'null'::jsonb,
  'I-2: その場合 previous_email_sent_at も null');
select is(
  (select result->'previous_metrics' from qa_runs where label = 'w1'),
  (select metrics from public.weekly_usage_reports where week_start = '2026-10-24'),
  'I-3: 7日前の行があれば、その metrics を previous_metrics として返す');
select is((select result->'previous_email_sent_at' from qa_runs where label = 'w1'), 'null'::jsonb,
  'I-4: 前週の行が未送信なら previous_email_sent_at は null');

-- =============================================================================
-- J. 子の作り直し (成功条件 5) と、再実行・送信済みの記録 (保存と先週比)
-- =============================================================================
-- 子を作り直す (replacePracticeTimes / replaceSplitTimes / チームの一括編集と同じ delete + insert)
delete from public.practice_times where practice_log_id = public.qa_e(304);
insert into public.practice_times (user_id, practice_log_id, rep_number, set_number, time) values
  (public.qa_u(4), public.qa_e(304), 1, 1, 30.00),
  (public.qa_u(4), public.qa_e(304), 1, 2, 30.10),
  (public.qa_u(4), public.qa_e(304), 1, 3, 30.20);
delete from public.split_times where record_id = public.qa_e(504);
insert into public.split_times (record_id, distance, split_time) values
  (public.qa_e(504), 25, 27.90), (public.qa_e(504), 50, 58.80), (public.qa_e(504), 75, 90.00);
-- チームの一括編集 (replace_practice_logs) と同じく、管理者が選手のログを週内の時刻で作り直す。
-- 選手 u_rebuild はこのログしか持たないので、チーム練習のログを数えるとアクティブが1人増えて J-2 が赤になる
delete from public.practice_logs where id in (public.qa_e(306), public.qa_e(307));
insert into public.practice_logs (id, user_id, practice_id, style, rep_count, set_count, distance, created_at) values
  (public.qa_e(311), public.qa_u(18), public.qa_e(210), 'Fr', 1, 1, 100, '2026-11-05 20:00:00+09');

-- W の初回集計の後で課金の状態を変える (再実行で取り直さないことを見る)
update public.user_subscriptions set plan = 'free', status = 'expired' where id = public.qa_u(51);
update public.user_subscriptions set cancel_at_period_end = true where id = public.qa_u(56);
update public.user_subscriptions set plan = 'premium', status = 'active', provider = 'stripe',
  provider_environment = 'production', cancel_at_period_end = false where id = public.qa_u(63);

select public.mark_weekly_usage_report_sent('2026-10-31');
select ok(
  (select email_sent_at is not null from public.weekly_usage_reports where week_start = '2026-10-31'),
  'J-1: mark_weekly_usage_report_sent で email_sent_at が入る');

-- 再実行で消えないことを見るため、値を固定しておく
update public.weekly_usage_reports set email_sent_at = '2026-11-07 09:00:05+09' where week_start = '2026-10-31';
select public.mark_weekly_usage_report_sent('2026-10-24');
update public.weekly_usage_reports set email_sent_at = '2026-10-31 09:00:07+09' where week_start = '2026-10-24';

insert into qa_runs select 'w2', public.generate_weekly_usage_report('2026-10-31');

select is(
  (select result->'metrics' from qa_runs where label = 'w2'),
  (select result->'metrics' from qa_runs where label = 'w1'),
  'J-2: 子 (タイム・ラップ・チームのログ) の delete + insert と課金の状態の変更の後に再実行しても、指標は1つも変わらない');
select is(pg_temp.qa_metric('w2', 'practice.personal_logs_with_times'), pg_temp.qa_metric('w1', 'practice.personal_logs_with_times'),
  'J-3: タイム付きのログの件数は作り直しで増えない');
select is(pg_temp.qa_metric('w2', 'competition.personal_records_with_splits'), pg_temp.qa_metric('w1', 'competition.personal_records_with_splits'),
  'J-4: ラップ付きのレコードの件数は作り直しで増えない');
select is(pg_temp.qa_metric('w2', 'team.practices_with_logs'), pg_temp.qa_metric('w1', 'team.practices_with_logs'),
  'J-5: ログ付きのチーム練習の件数はログの作り直しで変わらない');
select is(
  (select count(*)::int from public.weekly_usage_reports where week_start = '2026-10-31'),
  1,
  'J-6: 同じ週の再実行は上書き (行は1つ)');
select is(
  (select email_sent_at from public.weekly_usage_reports where week_start = '2026-10-31'),
  timestamptz '2026-11-07 09:00:05+09',
  'J-7: 再実行しても email_sent_at は消えない (巻き戻さない)');
select is(
  (select (result->>'email_sent_at')::timestamptz from qa_runs where label = 'w2'),
  timestamptz '2026-11-07 09:00:05+09',
  'J-8: 返り値の email_sent_at も保存行の値 (送信済みの判定に使う)');
select is(
  (select (result->>'previous_email_sent_at')::timestamptz from qa_runs where label = 'w2'),
  timestamptz '2026-10-31 09:00:07+09',
  'J-9: 前週が送信済みなら previous_email_sent_at にその時刻が入る');
select is(
  (select count(*)::int from public.user_subscription_snapshots
   where week_start = '2026-10-31' and user_id in (select public.qa_u(n) from generate_series(51, 69) n)),
  11,
  'J-10: 再実行してもスナップショットは重複せず、後から有料になった s13 も足さない');
select is(
  (select row(status, provider, cancel_at_period_end)::text from public.user_subscription_snapshots
   where week_start = '2026-10-31' and user_id = public.qa_u(51)),
  row('active'::text, 'stripe'::text, false)::text,
  'J-12: 再実行してもスナップショットは取り直さない (s1 は free になった後も初回の状態のまま)');
select is(
  (select jsonb_object_agg(key, value) from jsonb_each((select result->'metrics' from qa_runs where label = 'w2'))
   where key like 'billing.%'),
  (select jsonb_object_agg(key, value) from jsonb_each((select result->'metrics' from qa_runs where label = 'w1'))
   where key like 'billing.%'),
  'J-13: 再実行しても課金の指標は初回のスナップショットから計算され、変わらない');

insert into qa_runs select 'p2', public.generate_weekly_usage_report('2026-10-24');
select is(
  (select count(*)::int from public.user_subscription_snapshots
   where week_start = '2026-10-24' and user_id in (select public.qa_u(n) from generate_series(51, 69) n)),
  9,
  'J-14: 過去の週 (P) を再実行しても、その週のスナップショットは今の状態で上書きされない');
select is(
  (select jsonb_object_agg(key, value) from jsonb_each((select result->'metrics' from qa_runs where label = 'p2'))
   where key like 'billing.%'),
  (select jsonb_object_agg(key, value) from jsonb_each((select result->'metrics' from qa_runs where label = 'p1'))
   where key like 'billing.%'),
  'J-15: 過去の週 (P) を再実行しても、その週の課金の指標は変わらない');
select is(
  (select metrics->'account.users_new' from public.weekly_usage_reports where week_start = '2026-10-17'),
  '999'::jsonb,
  'J-11: 他の週の行には触らない');

-- =============================================================================
-- K. 未分類テーブル (成功条件 11)
-- =============================================================================
select is(
  (select result->'uncategorized_tables' from qa_runs where label = 'w2'),
  '[]'::jsonb,
  'K-1: 今のスキーマでは未分類テーブルは0件');

create table public.qa_wr_uncategorized_probe (id int);
insert into qa_runs select 'w3', public.generate_weekly_usage_report('2026-10-31');

select is(
  (select result->'uncategorized_tables' from qa_runs where label = 'w3'),
  '["qa_wr_uncategorized_probe"]'::jsonb,
  'K-2: 分類にも除外リストにも無いテーブルが未分類に出る');
select is(
  (select uncategorized_tables from public.weekly_usage_reports where week_start = '2026-10-31'),
  array['qa_wr_uncategorized_probe']::text[],
  'K-3: 未分類テーブルは保存行にも入る');

-- =============================================================================
-- L. 既定の対象週 (引数 NULL)
-- =============================================================================
-- 実装と同じ式を写さず、「終わった直近の週」の性質で見る (JST の今日を T として)
--   土曜である / 週が終わっている (week_start + 7 <= T) / 直近である (week_start + 14 > T)
insert into qa_runs select 'dflt', public.generate_weekly_usage_report(null);
select is(
  (select extract(isodow from (result->>'week_start')::date)::int from qa_runs where label = 'dflt'),
  6,
  'L-1a: 引数が NULL のときの週は土曜始まり');
select ok(
  (select (result->>'week_start')::date + 7 <= (now() at time zone 'Asia/Tokyo')::date from qa_runs where label = 'dflt'),
  'L-1b: その週は JST の今日までに終わっている (week_start + 7 <= 今日)');
select ok(
  (select (result->>'week_start')::date + 14 > (now() at time zone 'Asia/Tokyo')::date from qa_runs where label = 'dflt'),
  'L-1c: その週は終わった週のうち直近 (week_start + 14 > 今日)');

select throws_ok(
  $$ select public.generate_weekly_usage_report('2026-11-01') $$,
  null, null,
  'L-2: 土曜でない p_week_start (日曜) は例外');
select throws_ok(
  $$ select public.generate_weekly_usage_report('2026-11-06') $$,
  null, null,
  'L-3: 土曜でない p_week_start (金曜) は例外');
select is(
  (select count(*)::int from public.weekly_usage_reports where week_start in ('2026-11-01', '2026-11-06')),
  0,
  'L-4: 土曜でない週の行は保存されない');

-- =============================================================================
-- M. 権限 (成功条件 12)
-- =============================================================================
create role qa_wr_nobody nologin;

select ok(
  not has_function_privilege('anon', 'public.generate_weekly_usage_report(date)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.generate_weekly_usage_report(date)', 'EXECUTE')
  and not has_function_privilege('qa_wr_nobody', 'public.generate_weekly_usage_report(date)', 'EXECUTE'),
  'M-1: generate は anon / authenticated / PUBLIC (無関係のロール) から実行できない');
select ok(
  has_function_privilege('service_role', 'public.generate_weekly_usage_report(date)', 'EXECUTE'),
  'M-2: generate は service_role が実行できる');
select ok(
  not has_function_privilege('anon', 'public.mark_weekly_usage_report_sent(date)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.mark_weekly_usage_report_sent(date)', 'EXECUTE')
  and not has_function_privilege('qa_wr_nobody', 'public.mark_weekly_usage_report_sent(date)', 'EXECUTE'),
  'M-3: mark は anon / authenticated / PUBLIC から実行できない');
select ok(
  has_function_privilege('service_role', 'public.mark_weekly_usage_report_sent(date)', 'EXECUTE'),
  'M-4: mark は service_role が実行できる');
select ok(
  not has_function_privilege('anon', 'public.invoke_weekly_usage_report()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.invoke_weekly_usage_report()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.invoke_weekly_usage_report()', 'EXECUTE')
  and not has_function_privilege('qa_wr_nobody', 'public.invoke_weekly_usage_report()', 'EXECUTE'),
  'M-5: invoke は cron (postgres) 専用で、service_role も含めて実行できない');

select ok(
  (select bool_and(not has_table_privilege(r, t, p))
   from unnest(array['anon','authenticated']) r,
        unnest(array['public.weekly_usage_reports','public.user_subscription_snapshots']) t,
        unnest(array['SELECT','INSERT','UPDATE','DELETE']) p),
  'M-6: 2つのテーブルは anon / authenticated から SELECT / INSERT / UPDATE / DELETE できない');
select ok(
  (select bool_and(has_table_privilege('service_role', t, p))
   from unnest(array['public.weekly_usage_reports','public.user_subscription_snapshots']) t,
        unnest(array['SELECT','INSERT','UPDATE','DELETE']) p),
  'M-7: 2つのテーブルは service_role に明示的に GRANT されている');
select ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('public.weekly_usage_reports'::regclass, 'public.user_subscription_snapshots'::regclass)),
  'M-8: 2つのテーブルとも RLS が有効');
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename in ('weekly_usage_reports', 'user_subscription_snapshots')),
  0,
  'M-9: 2つのテーブルにポリシーは無い');
select ok(
  (select bool_and(p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
                   and p.proconfig @> array['search_path=public'])
   from pg_proc p
   where p.oid in ('public.generate_weekly_usage_report(date)'::regprocedure,
                   'public.mark_weekly_usage_report_sent(date)'::regprocedure)),
  'M-10: generate / mark は SECURITY DEFINER・OWNER postgres・SET search_path = public');

select public.qa_login_as(public.qa_u(1));
select throws_ok(
  $$ select public.generate_weekly_usage_report('2026-10-31') $$,
  '42501',
  null,
  'M-11: authenticated が generate を呼ぶと 42501 (permission denied)');
select public.qa_logout();

-- =============================================================================
-- N. cron と invoke (成功条件 13・14)
-- =============================================================================
select case when exists (select 1 from pg_extension where extname = 'pg_cron')
  then collect_tap(
    is(
      (select count(*)::int from cron.job where command ilike '%invoke_weekly_usage_report%'),
      1,
      'N-1: invoke_weekly_usage_report を呼ぶ cron ジョブが1件だけ登録されている'),
    is(
      (select schedule from cron.job where command ilike '%invoke_weekly_usage_report%'),
      '0 22 * * 5',
      'N-2: スケジュールは毎週金曜 22:00 UTC (= 土曜 07:00 JST)')
  )
  else collect_tap(
    skip('pg_cron 無効環境のためジョブ登録の検証をスキップ', 2)
  )
end;

-- vault に値が無い環境では NOTICE を出して何もしない。この DB の vault に2つの secret
-- (project_url / weekly_report_cron_secret) が揃っている場合は実際に送ってしまうので、
-- その環境ではスキップする。送信の有無はこのテストでは見ない (lives_ok だけ)
select case when (select count(distinct name) from vault.secrets
                  where name in ('project_url', 'weekly_report_cron_secret')) = 2
  then collect_tap(
    skip('vault に secret がある環境のため invoke の実行はスキップ (実際に HTTP を送るため)', 1)
  )
  else collect_tap(
    lives_ok(
      $$ select public.invoke_weekly_usage_report() $$,
      'N-3: vault に値が無い環境で invoke_weekly_usage_report() を呼んでも失敗しない')
  )
end;

select * from finish();
rollback;
