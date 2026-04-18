-- processed_webhook_events の自動クリーンアップ（90日以上前のレコードを削除）
-- pg_cron が有効な場合のみスケジュールを登録する
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'cleanup-processed-webhook-events',
      '0 3 * * *',
      $job$DELETE FROM processed_webhook_events WHERE processed_at < NOW() - INTERVAL '90 days'$job$
    );
  END IF;
END $migration$;
