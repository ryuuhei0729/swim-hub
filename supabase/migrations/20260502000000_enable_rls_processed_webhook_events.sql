-- Fix: processed_webhook_events に RLS を有効化
-- 作成時 (20260312000001) に RLS を有効化していなかったため、anon key で
-- INSERT / DELETE / SELECT が可能だった。これにより Webhook 冪等性レコードを
-- 改竄され、二重処理 (二重課金) や Webhook DoS のリスクがあった。
--
-- このテーブルへの正規アクセスは Edge Functions の service_role のみ
-- (stripe-webhook-handler / revenucat-webhook-handler)。service_role は RLS を
-- バイパスするため、明示的なポリシーは不要。anon / authenticated は no policy =
-- 全拒否となる。
ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;
