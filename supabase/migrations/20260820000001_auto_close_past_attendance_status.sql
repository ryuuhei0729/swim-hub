-- =============================================================================
-- 過去日イベント (練習・大会) の attendance_status を DB 側でも closed にする
--
-- 役割分担 (20260820000000_auto_close_past_competition_entry_status.sql と同一):
--   フロント (apps/shared/utils/attendanceStatus.ts の resolveAttendanceStatus /
--   isCompetitionDateInPast): 端末ローカル日付で即時判定する。ユーザーごとに
--   タイムゾーンが異なる以上、「ユーザーごとの受付終了タイミング」は 1行1値の
--   DB カラムでは表現できず、フロント制御以外に実装しえない。これが表示の権威。
--   DB (本 migration): 全 TZ で結果整合を取るための補助。通知クエリ・分析・
--   直 SQL といった UI を経由しない消費者からも整合性を保てるようにする。
--
-- 不変条件 (最重要): 「DB で closed」⊆「フロントで closed」。
--   DB はどの端末のローカル日付よりも早く closed にしてはならない。
--   resolveAttendanceStatus は過去日に closed を強制するだけで、DB の closed を
--   open に戻すことはしない。したがって DB が早く閉じるとフロントの端末ローカル
--   判断を上書きしてしまい救済不能になる (例: JST で日付が変わった瞬間に DB を
--   closed にすると、その時点でまだイベント当日のタイムゾーンのユーザーにも
--   「受付終了」が見え、出欠を出せなくなる)。
--   そのため境界は UTC-12 (Anywhere on Earth, 地球上で最も遅れる標準時) を使う。
--   UTC-12 で日付が変わった時点では、地球上のどのタイムゾーンでも既に日付が
--   変わっている (= イベント当日ではない) ことが保証される。
--
-- 相違点 (entry_status 版との差): 対象テーブルが practices / competitions の
-- 2つあり同じ述語が4箇所 (バックフィル2 + cron 2) に散るため、関数 1 本に
-- 集約する。これにより
--   - バックフィルと日次ジョブが同一コードを通る (乖離不能)
--   - pgTAP (supabase/tests/08_auto_close_past_attendance_status.test.sql) から
--     実物の関数を直接呼んで検証できる (述語のコピーを突き合わせる
--     トートロジーを回避)
-- を両立させる。
--
-- attendance_status の enum は open/closed の2値のみ (entry_status の before に
-- 相当する値は無い)。NULL は「未設定」表示を持つ独立した状態だが、過去日に
-- ついては resolveAttendanceStatus が NULL でも closed を返すため、DB 側も
-- NULL を含めて closed に揃える (IS DISTINCT FROM 'closed')。今日・未来の
-- NULL は触らないので「未設定」の意味は失われない。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. close_past_attendance_status(): 過去日イベントを締切に揃える
--
-- 境界日は UTC-12 (Anywhere on Earth)。`Etc/GMT+12` は POSIX 由来で符号が
-- 直感と逆 (Etc/GMT+12 = UTC-12) のため使わず、`NOW() AT TIME ZONE 'UTC'`
-- (timestamptz → naive timestamp) から `INTERVAL '12 hours'` を引く形で明示的に
-- 計算する。これによりセッション TZ に依存しない。CURRENT_DATE は DB 既定の
-- UTC 基準で上記不変条件を破るため使わない。
--
-- 対象は開始日 date (competitions.end_date は使わない)。
-- resolveAttendanceStatus / canSubmitAttendance / isCompetitionDateInPast が
-- すべて date 基準であり、DB 側だけ end_date を採用すると複数日開催の大会で
-- DB と表示が食い違い本 migration の目的が崩れる。
--
-- 既に closed の行は除外し updated_at を無駄に更新しない
-- (update_practices_updated_at / update_competitions_updated_at が発火するため)。
--
-- SECURITY INVOKER (既定) のまま置く。日次実行は pg_cron が postgres として
-- 呼ぶため権限は足りる。SECURITY DEFINER にすると呼び出せた者が RLS を
-- 迂回して全チームの行を更新できてしまうため採用しない。
-- 更新行数を返し、cron ログ・手動実行時に効果が観測できるようにする。
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."close_past_attendance_status"()
RETURNS integer
LANGUAGE "plpgsql"
SET search_path = public
AS $function$
DECLARE
  -- UTC-12 (Anywhere on Earth) の現在日。
  v_aoe_today date := (NOW() AT TIME ZONE 'UTC' - INTERVAL '12 hours')::date;
  v_practices integer;
  v_competitions integer;
BEGIN
  UPDATE "public"."practices"
  SET "attendance_status" = 'closed'
  WHERE "date" < v_aoe_today
    AND "attendance_status" IS DISTINCT FROM 'closed';
  GET DIAGNOSTICS v_practices = ROW_COUNT;

  UPDATE "public"."competitions"
  SET "attendance_status" = 'closed'
  WHERE "date" < v_aoe_today
    AND "attendance_status" IS DISTINCT FROM 'closed';
  GET DIAGNOSTICS v_competitions = ROW_COUNT;

  RETURN v_practices + v_competitions;
END;
$function$;

COMMENT ON FUNCTION "public"."close_past_attendance_status"() IS 'UTC-12 (Anywhere on Earth) 基準で過去日になった練習・大会の attendance_status を closed に揃え、更新行数を返す。日次 pg_cron ジョブ close-past-attendance-status から呼ばれる。表示上の境界は端末ローカル日付 (apps/shared/utils/attendanceStatus.ts resolveAttendanceStatus) が権威であり、本関数は全タイムゾーンで過去であることが確定してから DB を追随させる (DB がフロントより先に closed にしないための不変条件)。';

-- アプリのロールから実行権限を剥がす。既定で PUBLIC に EXECUTE が付くため
-- 明示 REVOKE が必要 (新規テーブルへの GRANT ALL と同種の穴)。
-- 呼び出すのは pg_cron (postgres) と運用時の手動実行のみ。
REVOKE ALL ON FUNCTION "public"."close_past_attendance_status"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."close_past_attendance_status"() FROM "anon";
REVOKE ALL ON FUNCTION "public"."close_past_attendance_status"() FROM "authenticated";

-- -----------------------------------------------------------------------------
-- 2. 既存データのバックフィル
--
-- pg_cron の有無に関わらず必ず実行する (下の DO ブロックのガード外に置き、
-- pg_cron 無効環境=ローカル等でも既存データを揃える)。
-- -----------------------------------------------------------------------------
SELECT "public"."close_past_attendance_status"();

-- -----------------------------------------------------------------------------
-- 3. pg_cron の有効化 + ジョブ登録
--
-- 既存パターン (20260320000001_cleanup_webhook_events.sql /
-- 20260820000000_auto_close_past_competition_entry_status.sql) は
-- 「pg_cron があれば登録、無ければ NOTICE」だけだったが、それだと拡張を
-- 有効化してから migration を再適用するという手作業が残り、忘れると日次ジョブが
-- 恒久的に未登録のまま (= DB 側の整合性が永久に取れない) になる。
-- そこで本 migration は拡張の作成まで面倒を見る。
--
-- pg_cron は Supabase のローカル/ホスティングいずれも shared_preload_libraries に
-- 含まれているが拡張自体は既定で未作成。作成先スキーマと付随 GRANT は Supabase 公式手順
-- (https://supabase.com/docs/guides/cron/install) と同じ pg_catalog / cron スキーマ。
-- 作成に失敗しても (権限不足・preload 未設定など) migration 全体は失敗させず
-- NOTICE に落として先へ進む。
-- -----------------------------------------------------------------------------
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";
      -- cron スキーマの所有者は supabase_admin のため、migration 実行ロール
      -- (postgres) から cron.job を参照・管理できるよう明示的に付与する。
      GRANT USAGE ON SCHEMA "cron" TO "postgres";
      GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "cron" TO "postgres";
      RAISE NOTICE 'pg_cron を有効化しました。';
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'pg_cron の有効化に失敗しました (%). ジョブ登録をスキップします。バックフィルは適用済みです。Supabase Dashboard の Integrations -> Cron から有効化した上で本 migration を再適用してください。', SQLERRM;
    END;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- cron は UTC で動作する。UTC-12 (Anywhere on Earth) の現地 00:05 は
    -- UTC 12:05 (UTC-12 は UTC より 12 時間遅れているため、UTC 側では
    -- 12 時間進んだ時刻になる: 00:05 + 12:00 = 12:05)。
    -- つまりイベント日 D が UTC-12 で過去になるのは UTC (D+1) 12:05 の時点であり、
    -- ここに 5 分のバッファを足してクロックのずれを吸収している。
    -- UTC-12 は地球上で最後に日付が変わるタイムゾーンなので、この時刻には
    -- 全タイムゾーンで既に日付 D+1 に切り替わっている (= イベント日 D はどの
    -- ユーザーから見ても過去) ことが保証される ("5 12 * * *")。
    -- entry_status 版 (close-past-competition-entry-status) と同時刻。
    --
    -- cron.schedule(job_name, schedule, command) は同一ジョブ名 (+実行ユーザー) の
    -- 再呼び出しが既存ジョブの schedule/command 更新になるため (pg_cron
    -- src/job_metadata.c ScheduleCronJob の ON CONFLICT DO UPDATE)、
    -- 事前の cron.unschedule は不要で冪等。
    PERFORM cron.schedule(
      'close-past-attendance-status',
      '5 12 * * *',
      $job$SELECT public.close_past_attendance_status()$job$
    );
  ELSE
    -- 上の有効化が失敗したケース。ジョブ未登録のまま無言で完走すると DB 側の
    -- 整合性が誰にも気づかれず恒久的に失敗し続けるため NOTICE で気づけるようにする
    -- (migration 自体は RAISE EXCEPTION にせず成功させる: バックフィルは有効で、
    --  表示は端末ローカル判定で正しいまま = 機能は動くため)。
    RAISE NOTICE 'pg_cron が無効なため日次自動クローズジョブ (close-past-attendance-status) を登録しませんでした。バックフィルのみ適用済みです。';
  END IF;
END $migration$;

-- -----------------------------------------------------------------------------
-- 4. 意図の記録 (initial_schema.sql の既存説明を保持したまま追記)
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN "public"."practices"."attendance_status" IS '出欠提出ステータス: open=提出受付中, closed=提出締切。表示上は各ユーザーの端末ローカル日付で練習日が過去になった時点で即時に closed 扱いになる (apps/shared/utils/attendanceStatus.ts の resolveAttendanceStatus によるフロント制御。DB 値は上書きしない)。DB 側の本カラムは、練習日 date が UTC-12 (Anywhere on Earth、地球上で最も遅れる標準時) 基準で過去日になった時点で、日次 pg_cron ジョブ (close-past-attendance-status) および本 migration のバックフィルにより自動的に closed に更新される (全タイムゾーンで既に過去であることが確定してから DB を更新するため、フロントの判定より先に closed になることはない)。';

COMMENT ON COLUMN "public"."competitions"."attendance_status" IS '出欠提出ステータス: open=提出受付中, closed=提出締切。表示上は各ユーザーの端末ローカル日付で大会開始日が過去になった時点で即時に closed 扱いになる (apps/shared/utils/attendanceStatus.ts の resolveAttendanceStatus によるフロント制御。DB 値は上書きしない)。DB 側の本カラムは、大会開始日 date が UTC-12 (Anywhere on Earth、地球上で最も遅れる標準時) 基準で過去日になった時点で、日次 pg_cron ジョブ (close-past-attendance-status) および本 migration のバックフィルにより自動的に closed に更新される (全タイムゾーンで既に過去であることが確定してから DB を更新するため、フロントの判定より先に closed になることはない)。';
