-- =============================================================================
-- SwimHub 共通サブスクリプション & 利用量管理テーブル
-- 対象アプリ: swimhub, swimhub_timer, swimhub_scanner
-- =============================================================================

-- アプリ識別用の型
CREATE TYPE app_id AS ENUM ('swimhub', 'swimhub_timer', 'swimhub_scanner');

-- ユーザーサブスクリプション（アプリ横断で共通）
CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  premium_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- アプリ別の日次利用量
CREATE TABLE app_daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app app_id NOT NULL,
  usage_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Tokyo')::date,
  usage_count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  UNIQUE (user_id, app, usage_date)
);

-- インデックス
CREATE INDEX idx_app_daily_usage_lookup ON app_daily_usage (user_id, app, usage_date);

-- RLS 有効化
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_daily_usage ENABLE ROW LEVEL SECURITY;

-- user_subscriptions: 自分のデータのみアクセス可
CREATE POLICY "subscriptions_select" ON user_subscriptions
  FOR SELECT USING ((select auth.uid()) = id);
CREATE POLICY "subscriptions_insert" ON user_subscriptions
  FOR INSERT WITH CHECK ((select auth.uid()) = id);
CREATE POLICY "subscriptions_update" ON user_subscriptions
  FOR UPDATE USING ((select auth.uid()) = id);

-- app_daily_usage: 自分のデータのみアクセス可
CREATE POLICY "daily_usage_select" ON app_daily_usage
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "daily_usage_insert" ON app_daily_usage
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "daily_usage_update" ON app_daily_usage
  FOR UPDATE USING ((select auth.uid()) = user_id);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_user_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_subscriptions_updated_at();
