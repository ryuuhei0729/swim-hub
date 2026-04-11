-- =============================================================================
-- Fix: user_subscriptions の UPDATE RLS ポリシーを制限
-- ユーザーが自分の plan を直接書き換えられるセキュリティホールを修正
-- plan の更新は Stripe Webhook 経由 (service_role) のみ許可する
-- =============================================================================

-- 既存の UPDATE ポリシーを削除
DROP POLICY IF EXISTS "subscriptions_update" ON user_subscriptions;

-- 新しい UPDATE ポリシー: service_role のみ (RLS は service_role をバイパスするため、
-- ユーザーレベルでは UPDATE を一切許可しない)
-- 注: service_role クライアントは RLS をバイパスするため、明示的なポリシーは不要

-- =============================================================================
-- Fix: incrementScanCount の TOCTOU 競合状態を解消する atomic RPC 関数
-- =============================================================================

CREATE OR REPLACE FUNCTION increment_daily_usage(
  p_user_id UUID,
  p_app app_id,
  p_usage_date DATE,
  p_last_used_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO app_daily_usage (user_id, app, usage_date, usage_count, last_used_at)
  VALUES (p_user_id, p_app, p_usage_date, 1, p_last_used_at)
  ON CONFLICT (user_id, app, usage_date)
  DO UPDATE SET
    usage_count = app_daily_usage.usage_count + 1,
    last_used_at = p_last_used_at;
END;
$$;
