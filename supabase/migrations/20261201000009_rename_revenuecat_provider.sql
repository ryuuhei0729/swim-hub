-- =============================================================================
-- user_subscriptions.provider の綴り間違い 'revenucat' を 'revenuecat' に直す
--
-- 変更前: CHECK (provider IN ('stripe', 'revenucat'))。RevenueCat の Webhook
--   (swim-hub・swimhub-timer・swimhub-scanner の revenucat-webhook-handler) が 'revenucat' を書き込む。
--   週次レポートは provider の値をそのまま指標キーにしている (billing.premium_total.revenucat など)。
-- 変更後:
--   - 既存の行・週次スナップショット・保存済みの週次レポートの指標キーを 'revenuecat' に書き換える
--   - CHECK を ('stripe', 'revenuecat') にする
--   - 'revenucat' が書き込まれたら 'revenuecat' に直すトリガを置く。
--     swimhub-timer・swimhub-scanner の Webhook は別リポジトリで、デプロイの順序が揃わないため。
--     timer と scanner の両方の修正 (provider: "revenuecat") が本番に出たら、このトリガは削除してよい。
-- =============================================================================

-- 移行用トリガ (CHECK より先に BEFORE トリガで値が直る)
CREATE OR REPLACE FUNCTION "public"."normalize_legacy_revenuecat_provider"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET search_path = public
    AS $$
BEGIN
  IF NEW.provider = 'revenucat' THEN
    NEW.provider := 'revenuecat';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION "public"."normalize_legacy_revenuecat_provider"() IS
  '移行用。旧綴り revenucat を revenuecat に直す。swimhub-timer と swimhub-scanner の revenucat-webhook-handler が revenuecat を書くようになったら削除する';

REVOKE ALL ON FUNCTION "public"."normalize_legacy_revenuecat_provider"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE TRIGGER "normalize_legacy_revenuecat_provider"
  BEFORE INSERT OR UPDATE OF "provider" ON "public"."user_subscriptions"
  FOR EACH ROW EXECUTE FUNCTION "public"."normalize_legacy_revenuecat_provider"();

-- 既存データ
ALTER TABLE "public"."user_subscriptions" DROP CONSTRAINT "user_subscriptions_provider_check";

UPDATE "public"."user_subscriptions" SET "provider" = 'revenuecat' WHERE "provider" = 'revenucat';
UPDATE "public"."user_subscription_snapshots" SET "provider" = 'revenuecat' WHERE "provider" = 'revenucat';

UPDATE "public"."weekly_usage_reports" r
SET "metrics" = (
  SELECT jsonb_object_agg(regexp_replace(e.key, '\.revenucat$', '.revenuecat'), e.value)
  FROM jsonb_each(r."metrics") AS e
)
WHERE EXISTS (SELECT 1 FROM jsonb_object_keys(r."metrics") AS k WHERE k LIKE '%.revenucat');

ALTER TABLE "public"."user_subscriptions"
  ADD CONSTRAINT "user_subscriptions_provider_check"
  CHECK ("provider" IS NULL OR "provider" = ANY (ARRAY['stripe'::"text", 'revenuecat'::"text"]));
