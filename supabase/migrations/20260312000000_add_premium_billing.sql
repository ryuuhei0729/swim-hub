-- =============================================================================
-- Premium 課金基盤マイグレーション
-- billing-plan.md の設計に基づき、サブスクリプション管理を拡張する
-- =============================================================================

-- 1. user_subscriptions にカラム追加
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_subscription_id text,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_start timestamptz,
  ADD COLUMN IF NOT EXISTS trial_end timestamptz;

-- status の CHECK 制約
ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_status_check
  CHECK (status IS NULL OR status IN ('trialing', 'active', 'canceled', 'expired', 'past_due'));

-- provider の CHECK 制約
ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_provider_check
  CHECK (provider IS NULL OR provider IN ('stripe', 'revenucat'));

-- 2. app_daily_usage にトークンカラム追加
ALTER TABLE app_daily_usage
  ADD COLUMN IF NOT EXISTS daily_tokens_used int DEFAULT 0;

-- 3. token_consumption_log を新規作成
CREATE TABLE IF NOT EXISTS token_consumption_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  app app_id NOT NULL,
  consumed_at timestamptz DEFAULT now() NOT NULL,
  token_source text NOT NULL,
  action_type text NOT NULL,
  reference_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- token_source の CHECK 制約
ALTER TABLE token_consumption_log
  ADD CONSTRAINT token_consumption_log_source_check
  CHECK (token_source IN ('daily_free', 'purchased'));

-- action_type の CHECK 制約
ALTER TABLE token_consumption_log
  ADD CONSTRAINT token_consumption_log_action_check
  CHECK (action_type IN ('scanner_scan', 'swimhub_image_analysis'));

-- インデックス
CREATE INDEX IF NOT EXISTS idx_token_consumption_log_user_id
  ON token_consumption_log(user_id);
CREATE INDEX IF NOT EXISTS idx_token_consumption_log_consumed_at
  ON token_consumption_log(consumed_at);

-- 4. RLS ポリシー
ALTER TABLE token_consumption_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own token consumption logs"
  ON token_consumption_log FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own token consumption logs"
  ON token_consumption_log FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);
