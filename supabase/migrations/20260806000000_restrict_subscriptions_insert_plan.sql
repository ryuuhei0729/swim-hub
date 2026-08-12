-- =============================================================================
-- セキュリティ監査 Medium: M-7 (subscriptions_insert に plan 制約が無い)
-- =============================================================================
--
-- 背景:
--   user_subscriptions の INSERT ポリシー "subscriptions_insert"
--   (20260223000000_add_scanner_tables.sql:39-40) は WITH CHECK
--   ((select auth.uid()) = id) のみで、plan カラムの値を一切検証していない。
--   ユーザーが自分の行を初回 INSERT する際に plan = 'premium' を自己申告で
--   書き込めてしまう。
--
-- 対策: WITH CHECK に plan = 'free' を追加する。
--
-- 影響確認 (正規フローが壊れない根拠。PM 実測):
--   plan に書き込まれる値は3アプリ全経路で 'free'/'premium' の2値のみ。
--   - handle_new_user トリガー (20260313000000...sql:23-24,31-32) は plan を
--     'free' 固定で INSERT する。
--   - クライアント側の fallback insert は plan 列を渡さず、カラム DEFAULT
--     'free' に依存する。
--   - Stripe webhook が plan='premium' に更新する経路は service_role で実行
--     され RLS をバイパスするため、この INSERT ポリシーの影響を受けない。
--   → この制約で壊れる既存経路はゼロ。ユーザー自身による plan='premium' の
--     自己申告 INSERT のみを新たに拒否する。
--
-- 冪等性: DROP POLICY IF EXISTS の後に CREATE POLICY するのみで、既存データ
-- (行そのもの) には影響しない。
-- =============================================================================

DROP POLICY IF EXISTS "subscriptions_insert" ON user_subscriptions;

CREATE POLICY "subscriptions_insert" ON user_subscriptions
  FOR INSERT WITH CHECK ((select auth.uid()) = id AND plan = 'free');
