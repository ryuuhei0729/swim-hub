-- Webhook 冪等性保証用テーブル
-- Stripe / RevenueCat の Webhook イベントを at-most-once で処理するために使用
CREATE TABLE IF NOT EXISTS processed_webhook_events (
  event_id text PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- クリーンアップ用インデックス（90日超のレコード削除を高速化）
CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_processed_at
  ON processed_webhook_events(processed_at);
