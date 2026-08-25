-- =============================================================================
-- entry_status の日次自動クローズジョブを登録し直す
--
-- 経緯: 20260820000000_auto_close_past_competition_entry_status.sql は
-- 「pg_cron があればジョブ登録、無ければ NOTICE」という構造で、pg_cron の
-- 有効化自体は行わない。一方 pg_cron を有効化するのは後続の
-- 20260820000001_auto_close_past_attendance_status.sql である。
-- したがって適用順は
--   0820000000 (pg_cron 未作成 → NOTICE でスキップ)
--   → 0820000001 (pg_cron を CREATE EXTENSION → 自分のジョブは登録)
-- となり、**entry_status のジョブだけが未登録のまま残る**。
-- 本番 push (2026-08-20) で実際にこの NOTICE が出て未登録になったことを確認済み。
-- fresh な `supabase db reset` でも同じ順序なので同じ結果になる。
--
-- 本 migration はその取りこぼしを回収する。0820000000 のバックフィルと COMMENT は
-- 正常に適用されているため、ここではジョブ登録のみを行う。
--
-- 恒久対策としては 0820000000 側に 0820000001 と同じ CREATE EXTENSION ブロックを
-- 入れるのが本筋だが、同ファイルは別作業の所有物なので触らず、後追いの
-- migration として分離する。
--
-- schedule / command は 0820000000 が登録しようとしたものと同一。
-- ("5 12 * * *" = UTC 12:05 = UTC-12 (Anywhere on Earth) の 00:05。
--  境界を UTC-12 に置く理由は 0820000000 冒頭の不変条件コメントを参照:
--  「DB で closed」⊆「フロントで closed」を守るため)
-- =============================================================================

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- cron.schedule はジョブ名 (+実行ユーザー) で upsert されるため、既に
    -- 登録済みの環境 (0820000000 を pg_cron 有効化後に再適用したローカル等) では
    -- 重複追加ではなく同一ジョブの更新になる = 冪等。
    PERFORM cron.schedule(
      'close-past-competition-entry-status',
      '5 12 * * *',
      $job$UPDATE "public"."competitions" SET "entry_status" = 'closed' WHERE "date" < (NOW() AT TIME ZONE 'UTC' - INTERVAL '12 hours')::date AND "entry_status" <> 'closed'$job$
    );
  ELSE
    -- 0820000001 が pg_cron を有効化しているはずなので、ここに来るのは
    -- 有効化に失敗した環境。黙って完走させず NOTICE で気づけるようにする。
    RAISE NOTICE 'pg_cron が無効なため close-past-competition-entry-status を登録できませんでした。20260820000001 の pg_cron 有効化が失敗している可能性があります。';
  END IF;
END $migration$;
