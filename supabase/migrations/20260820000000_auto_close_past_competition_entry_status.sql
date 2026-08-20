-- 過去日大会の entry_status を DB 側でも closed にする。
--
-- 役割分担:
--   フロント (既存, apps/shared/utils/entryStatus.ts の resolveEntryStatus /
--   isCompetitionDateInPast): 端末ローカル日付で即時判定する。ユーザーごとに
--   タイムゾーンが異なる以上、「ユーザーごとの受付終了タイミング」は
--   1行1値の DB カラムでは表現できず、フロント制御以外に実装しえない。
--   撤去しない。
--   DB (今回追加): 全 TZ で結果整合を取るための補助。通知クエリ・web・分析等
--   UI 以外の消費者からもデータ整合性を保てるようにする。
--
-- 不変条件 (最重要): 「DB で closed」⊆「フロントで closed」。
--   DB はどの端末のローカル日付よりも早く closed にしてはならない。
--   resolveEntryStatus は closed を強制するだけで open には戻さないため、
--   DB が早く閉じるとフロントの端末ローカル判断を上書きしてしまい救済不能になる
--   (例: JST で日付が変わった瞬間に DB を closed にすると、その時点でまだ
--   大会当日のタイムゾーンのユーザーにも closed が見えてしまう)。
--   そのため境界は UTC-12 (Anywhere on Earth, 地球上で最も遅れる標準時) を使う。
--   UTC-12 で日付が変わった時点では、地球上のどのタイムゾーンでも既に日付が
--   変わっている (=大会当日ではない) ことが保証される。

-- ① 既存データのバックフィル。
-- pg_cron の有無に関わらず必ず実行する (DO ブロックのガード外に置き、
-- pg_cron 無効環境=ローカル等でも既存データを揃える)。
-- 境界は開始日 date を使う (end_date は使わない)。entry_status は
-- 「エントリー受付」の状態でありエントリーは大会開始前に締まるため、
-- 複数日開催中でも date を過ぎていれば締切扱いにする。表示派生
-- isCompetitionDateInPast も date を基準にしており、揃えないと DB と
-- 表示が食い違い今回の目的が崩れる。
-- タイムゾーンは UTC-12 (Anywhere on Earth) を使う。`Etc/GMT+12` は POSIX 由来で
-- 符号が直感と逆 (Etc/GMT+12 = UTC-12) のため使わず、`NOW() AT TIME ZONE 'UTC'`
-- (timestamptz → naive timestamp) から `INTERVAL '12 hours'` を引く形で明示的に
-- 計算する。これによりセッション TZ に依存しない。
-- before/open のいずれも closed にする (表示派生が両方を closed として
-- 描画するため)。既に closed の行は対象から除外し updated_at を無駄に
-- 更新しない (update_competitions_updated_at トリガーが発火するため)。
UPDATE "public"."competitions"
SET "entry_status" = 'closed'
WHERE "date" < (NOW() AT TIME ZONE 'UTC' - INTERVAL '12 hours')::date
  AND "entry_status" <> 'closed';

-- ② pg_cron ジョブ登録。
-- 既存パターン (20260320000001_cleanup_webhook_events.sql) を踏襲し、
-- pg_extension の存在チェック内でのみ cron.schedule を呼ぶ。
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- cron は UTC で動作する。境界を跨ぐ瞬間 (UTC-12 の現地日付が D+1 に
    -- 変わる瞬間) は UTC (D+1) 12:00:00 (UTC-12 は UTC より 12 時間遅れて
    -- いるため、UTC 側では 12 時間進んだ時刻になる)。
    -- cron の実行時刻はそこに 5 分のバッファを足した UTC (D+1) 12:05
    -- ("5 12 * * *")。バッファはクロックのずれを吸収するためのもの。
    -- UTC-12 は地球上で最後に日付が変わるタイムゾーンなので、境界を
    -- 跨いだ時点で全タイムゾーンが既に日付 D+1 に切り替わっている
    -- (= 大会日 D はどのユーザーから見ても過去) ことが保証される。
    --
    -- cron.schedule(job_name, schedule, command) は pg_cron 内部で
    -- `INSERT ... ON CONFLICT ON CONSTRAINT jobname_username_uniq DO UPDATE`
    -- として実装されており、同一ジョブ名 (+実行ユーザー) での再呼び出しは
    -- 新規追加ではなく既存ジョブの schedule/command 更新になる (pg_cron
    -- src/job_metadata.c ScheduleCronJob で確認済み)。よって既存パターンと
    -- 同様に事前の cron.unschedule は行わず、そのまま cron.schedule を
    -- 呼ぶだけで冪等性が担保される。
    PERFORM cron.schedule(
      'close-past-competition-entry-status',
      '5 12 * * *',
      $job$UPDATE "public"."competitions" SET "entry_status" = 'closed' WHERE "date" < (NOW() AT TIME ZONE 'UTC' - INTERVAL '12 hours')::date AND "entry_status" <> 'closed'$job$
    );
  ELSE
    -- pg_cron が無い環境ではジョブが登録されないまま無言で完走してしまうと、
    -- 今スプリントの目的 (DB 側の整合性) が誰にも気づかれず恒久的に失敗し続ける。
    -- migration 自体は失敗させず (RAISE EXCEPTION にはしない)、NOTICE で気づけるようにする。
    RAISE NOTICE 'pg_cron が無効なため日次自動クローズジョブ (close-past-competition-entry-status) を登録しませんでした。バックフィルのみ適用済みです。本番では pg_cron を有効化した上で本 migration を再適用してください。';
  END IF;
END $migration$;

-- ③ 意図の記録。DB カタログに残る COMMENT ON で、initial_schema.sql の
-- 既存説明 (before/open/closed の意味) を保持したまま、今回追加した
-- 自動クローズ仕様を追記する。
COMMENT ON COLUMN "public"."competitions"."entry_status" IS 'エントリーステータス: before=エントリー前, open=エントリー受付中, closed=エントリー締切。表示上は各ユーザーの端末ローカル日付で大会日が過去になった時点で即時に closed 扱いになる (apps/shared/utils/entryStatus.ts の resolveEntryStatus によるフロント制御。DB 値は上書きしない)。DB 側の本カラムは、大会開始日 date が UTC-12 (Anywhere on Earth、地球上で最も遅れる標準時) 基準で過去日になった時点で、日次 pg_cron ジョブ (close-past-competition-entry-status) および本 migration のバックフィルにより自動的に closed に更新される (全タイムゾーンで既に過去であることが確定してから DB を更新するため、フロントの判定より先に closed になることはない)。';
