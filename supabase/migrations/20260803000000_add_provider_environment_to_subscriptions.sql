-- =============================================================================
-- RevenueCat webhook イベントの environment (PRODUCTION / SANDBOX) を記録する
--
-- 背景:
--   App Store 審査員による購入は RevenueCat 上 SANDBOX として届く。
--   Premium 判定 (apps/shared/utils/premium.ts の checkIsPremium) は
--   plan / status / premium_expires_at のみを見ており、environment を見ないため、
--   本カラム追加後もサンドボックス由来の購入は従来どおり Premium が付与され続ける。
--   一方で、監査・失効判断のためにどの取引が sandbox 由来かを区別・記録できるようにする。
--
-- 非破壊的変更: NULL 許容・default なし。既存行は NULL のまま無害。
-- =============================================================================

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS provider_environment text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_subscriptions_provider_environment_check'
  ) THEN
    ALTER TABLE user_subscriptions
      ADD CONSTRAINT user_subscriptions_provider_environment_check
      CHECK (provider_environment IS NULL OR provider_environment IN ('production', 'sandbox'));
  END IF;
END $$;

-- 監査用の部分インデックス: sandbox 由来の行のみを対象に高速抽出できるようにする
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_provider_environment_sandbox
  ON user_subscriptions (id)
  WHERE provider_environment = 'sandbox';

-- =============================================================================
-- 監査手順 (実行はユーザーが行う):
--
-- 現在サンドボックス由来で有効な Premium を抽出する:
--
--   SELECT id, plan, status, provider, provider_environment, premium_expires_at
--   FROM user_subscriptions
--   WHERE provider_environment = 'sandbox' AND status IN ('active', 'trialing');
--
-- 注意: 本マイグレーション適用前に発生した RevenueCat イベントは environment を
-- 保存していないため、provider_environment は NULL のままであり、DB だけでは
-- 過去分がサンドボックス由来だったかを遡って判別できない。
-- =============================================================================
