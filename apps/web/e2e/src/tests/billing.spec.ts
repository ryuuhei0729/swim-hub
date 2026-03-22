import { expect, test } from "@playwright/test";
import { URLS } from "../config/config";

/**
 * 課金フローのE2Eテスト
 *
 * Stripe テストモードを想定した API バリデーション・認証テスト。
 * 実際の Stripe Checkout Session は呼び出さず、
 * API のバリデーションと認証チェックに集中する。
 *
 * テストケース:
 * - TC-BILLING-001: subscription/status API が認証なしで 401 を返す
 * - TC-BILLING-002: checkout API が無効な priceId で 400 を返す
 * - TC-BILLING-003: checkout API が priceId なしで 400 を返す
 * - TC-BILLING-004: verify-session API が不正なセッションIDで エラーを返す
 * - TC-BILLING-005: Settings ページにサブスクリプションセクションが表示される
 */

test.describe("課金フローのテスト", () => {
  /**
   * TC-BILLING-001: subscription/status API が認証なしで 401 を返す
   * 未認証状態で subscription status API にアクセスすると 401 が返る
   */
  test("TC-BILLING-001: subscription status requires auth", async ({ request }) => {
    const res = await request.get("/api/subscription/status");
    expect(res.status()).toBe(401);
  });

  /**
   * TC-BILLING-002: checkout API が無効な priceId で 400 を返す
   * 認証済み状態で不正な priceId を送信すると 400 が返る
   */
  test("TC-BILLING-002: checkout rejects invalid priceId", async ({ request }) => {
    const res = await request.post("/api/stripe/checkout", {
      data: { priceId: "price_invalid_test", interval: "monthly" },
    });
    expect(res.status()).toBe(400);
  });

  /**
   * TC-BILLING-003: checkout API が priceId なしで 400 を返す
   * priceId を含まないリクエストではバリデーションエラーまたは認証エラーが返る
   */
  test("TC-BILLING-003: checkout requires priceId", async ({ request }) => {
    const res = await request.post("/api/stripe/checkout", {
      data: {},
    });
    // 401 (認証なし) または 400 (バリデーション)
    expect([400, 401]).toContain(res.status());
  });

  /**
   * TC-BILLING-004: verify-session API が不正なセッションIDでエラーを返す
   * 存在しないセッションIDでは適切なエラーステータスが返る
   */
  test("TC-BILLING-004: verify-session rejects invalid session", async ({ request }) => {
    const res = await request.post("/api/stripe/verify-session", {
      data: { sessionId: "cs_test_invalid" },
    });
    expect([400, 401, 403, 500]).toContain(res.status());
  });

  /**
   * TC-BILLING-005: Settings ページにサブスクリプションセクションが表示される
   * ログイン済み状態で設定ページにアクセスすると、プラン関連の表示がある
   */
  test("TC-BILLING-005: settings page shows subscription section", async ({ page }) => {
    await page.goto(URLS.SETTINGS);
    await page.waitForLoadState("networkidle");

    // サブスクリプションセクションが表示されることを確認
    await expect(page.getByText(/プラン|Plan/i)).toBeVisible({ timeout: 10000 });
  });
});
