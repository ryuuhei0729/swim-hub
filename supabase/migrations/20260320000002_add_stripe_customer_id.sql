-- Stripe Customer ID をキャッシュするカラムを追加
-- Search API の eventual consistency 問題を回避するため、DB から直接取得できるようにする
ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
