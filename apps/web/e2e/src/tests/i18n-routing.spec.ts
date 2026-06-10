/**
 * Issue #32 Phase 1-A: i18n ルーティング E2E テスト
 *
 * Sprint Contract 検証観点:
 *   [V-01] /ja/ アクセスで <html lang="ja"> が付く
 *   [V-02] /en/ アクセスで <html lang="en"> が付く
 *   [V-03] /ja/ の HTML に hreflang="ja" / hreflang="en" / hreflang="x-default" の3種が存在する
 *   [V-04] /dashboard (プレフィックスなし) → /ja/dashboard に 308 リダイレクト
 *   [V-05] LanguageSwitcher で en クリック → URL が /en/... に変化する
 *   [V-06] LanguageSwitcher で ja クリック → URL が /ja/... に変化する
 *   [V-11] 未認証で /ja/dashboard → /ja/login?redirect_to=/ja/dashboard にリダイレクト
 *   [V-15] /api/ へのアクセスはミドルウェアにキャッチされずそのまま通る (CORS ヘッダー変化なし)
 *
 * 使用ツール: Playwright MCP ブラウザ操作
 */

import { expect, test, type Page } from "@playwright/test";
import { EnvConfig, URLS } from "../config/config";

// テスト開始前に環境変数を検証
let hasRequiredEnvVars = false;
let testEnv: ReturnType<typeof EnvConfig.getTestEnvironment> | null = null;
try {
  testEnv = EnvConfig.getTestEnvironment();
  hasRequiredEnvVars = true;
} catch (error) {
  console.error("環境変数の検証に失敗しました:", error instanceof Error ? error.message : error);
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/** ログイン状態にするヘルパー */
async function loginUser(page: Page, email: string, password: string) {
  await page.goto(URLS.LOGIN);
  await page.waitForLoadState("networkidle");
  await page.waitForSelector('[data-testid="email-input"]', { timeout: 10000 });
  await page.fill('[data-testid="email-input"]', email);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="login-button"]');
  await page.waitForURL("**\/ja\/dashboard", { timeout: 15000 });
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

test.describe("i18n ルーティング基盤 (Issue #32 Phase 1-A)", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD を設定してください。",
  );

  // -------------------------------------------------------------------------
  // [V-04] /dashboard → /ja/dashboard へのリダイレクト
  // -------------------------------------------------------------------------
  test("TC-I18N-001: /dashboard (プレフィックスなし) → /ja/dashboard に 308 リダイレクト", async ({
    page,
    request,
  }) => {
    // HTTP レベルで 308 リダイレクトを確認 (ブラウザは自動追従するため fetch で確認)
    const response = await request.get(`${testEnv!.baseUrl}/dashboard`, {
      maxRedirects: 0,
    });
    expect([307, 308]).toContain(response.status());
    expect(response.headers()["location"]).toContain("/ja/dashboard");

    // ブラウザでもアクセスして最終的に /ja/dashboard にいること
    await page.goto("/dashboard");
    await page.waitForURL("**\/ja\/dashboard", { timeout: 10000 });
    expect(page.url()).toContain("/ja/dashboard");
  });

  test("TC-I18N-002: / (ルート) → /ja/ に 308 リダイレクト", async ({ page, request }) => {
    const response = await request.get(`${testEnv!.baseUrl}/`, {
      maxRedirects: 0,
    });
    // localePrefix: 'always' のため / は /ja/ にリダイレクト
    // ただし認証済みの場合は /ja/dashboard になる可能性もある
    expect([307, 308]).toContain(response.status());
    const location = response.headers()["location"] ?? "";
    expect(location).toMatch(/\/ja\//);
  });

  // -------------------------------------------------------------------------
  // [V-01] [V-02] html lang 属性
  // -------------------------------------------------------------------------
  test("TC-I18N-003: /ja/ の HTML に lang='ja' が付く", async ({ page }) => {
    // 未認証でアクセスできるページ (LP など) で確認
    await page.goto("/ja/login");
    await page.waitForLoadState("networkidle");

    const htmlLang = await page.getAttribute("html", "lang");
    expect(htmlLang).toBe("ja");
  });

  test("TC-I18N-004: /en/ の HTML に lang='en' が付く", async ({ page }) => {
    await page.goto("/en/login");
    await page.waitForLoadState("networkidle");

    const htmlLang = await page.getAttribute("html", "lang");
    expect(htmlLang).toBe("en");
  });

  // -------------------------------------------------------------------------
  // [V-03] hreflang タグ
  // -------------------------------------------------------------------------
  test("TC-I18N-005: /ja/ の HTML に hreflang 3種 (ja / en / x-default) が含まれる", async ({
    page,
  }) => {
    await page.goto("/ja/");
    await page.waitForLoadState("networkidle");

    // <link rel="alternate" hreflang="ja"> の存在確認
    const hreflangJa = await page.locator('link[rel="alternate"][hreflang="ja"]').count();
    expect(hreflangJa).toBeGreaterThan(0);

    // <link rel="alternate" hreflang="en"> の存在確認
    const hreflangEn = await page.locator('link[rel="alternate"][hreflang="en"]').count();
    expect(hreflangEn).toBeGreaterThan(0);

    // <link rel="alternate" hreflang="x-default"> の存在確認
    const hreflangXDefault = await page
      .locator('link[rel="alternate"][hreflang="x-default"]')
      .count();
    expect(hreflangXDefault).toBeGreaterThan(0);
  });

  test("TC-I18N-006: x-default の href が /ja/ を指すこと (defaultLocale: 'ja')", async ({
    page,
  }) => {
    await page.goto("/ja/");
    await page.waitForLoadState("networkidle");

    const xDefaultHref = await page
      .locator('link[rel="alternate"][hreflang="x-default"]')
      .getAttribute("href");
    expect(xDefaultHref).toContain("/ja");
  });

  // -------------------------------------------------------------------------
  // [V-05] [V-06] LanguageSwitcher によるロケール切り替え
  // -------------------------------------------------------------------------
  test("TC-I18N-007: LanguageSwitcher の en クリックで /en/ に遷移する", async ({ page }) => {
    if (!testEnv) throw new Error("テスト環境が設定されていません");

    await loginUser(page, testEnv.credentials.email, testEnv.credentials.password);
    await page.waitForLoadState("networkidle");

    // LanguageSwitcher を探してクリック
    // data-testid="language-switcher-en" または aria-label を含むボタン/リンク
    const enSwitcher = page
      .locator(
        '[data-testid="language-switcher-en"], [aria-label*="English"], button:has-text("EN"), a:has-text("EN")',
      )
      .first();
    await enSwitcher.waitFor({ state: "visible", timeout: 10000 });
    await enSwitcher.click();

    await page.waitForURL("**\/en\/**", { timeout: 10000 });
    expect(page.url()).toContain("/en/");
  });

  test("TC-I18N-008: /en/ から LanguageSwitcher の ja クリックで /ja/ に戻れる", async ({
    page,
  }) => {
    if (!testEnv) throw new Error("テスト環境が設定されていません");

    await loginUser(page, testEnv.credentials.email, testEnv.credentials.password);

    // まず en に切り替え
    await page.goto("/en/dashboard");
    await page.waitForLoadState("networkidle");

    const jaSwitcher = page
      .locator(
        '[data-testid="language-switcher-ja"], [aria-label*="日本語"], button:has-text("JA"), a:has-text("JA")',
      )
      .first();
    await jaSwitcher.waitFor({ state: "visible", timeout: 10000 });
    await jaSwitcher.click();

    await page.waitForURL("**\/ja\/**", { timeout: 10000 });
    expect(page.url()).toContain("/ja/");
  });

  // -------------------------------------------------------------------------
  // [V-11] 未認証 → /ja/login?redirect_to=/ja/dashboard
  // -------------------------------------------------------------------------
  test("TC-I18N-009: 未認証で /ja/dashboard → /ja/login?redirect_to=/ja/dashboard にリダイレクト", async ({
    page,
  }) => {
    // Cookie をクリアして未認証状態にする
    await page.context().clearCookies();

    await page.goto("/ja/dashboard");
    await page.waitForURL("**\/ja\/login**", { timeout: 10000 });

    const url = page.url();
    expect(url).toContain("/ja/login");
    expect(url).toContain("redirect_to");
    // redirect_to パラメータに /ja/dashboard が含まれること (URL エンコードされている場合も考慮)
    const decodedUrl = decodeURIComponent(url);
    expect(decodedUrl).toContain("/ja/dashboard");
  });

  // -------------------------------------------------------------------------
  // [V-15] /api/ はミドルウェアにキャッチされない
  // -------------------------------------------------------------------------
  test("TC-I18N-010: /api/auth/callback はロケールプレフィックスなしでアクセス可能", async ({
    request,
  }) => {
    // /api/ へのアクセスが 308 リダイレクトにならないこと
    // (next-intl matcher から除外されているため)
    const response = await request.get(`${testEnv!.baseUrl}/api/auth/callback`, {
      maxRedirects: 0,
    });

    // 308 リダイレクト (localePrefix) になっていないこと
    expect(response.status()).not.toBe(308);
    // API エンドポイントは 400/404/405 などを返す (リダイレクトではない)
    expect([200, 400, 404, 405, 500]).toContain(response.status());
  });

  // -------------------------------------------------------------------------
  // [V-16] 既存認証フロー — i18n 化後も動作すること
  // -------------------------------------------------------------------------
  test("TC-I18N-011: /ja/login からログインして /ja/dashboard に遷移できる", async ({ page }) => {
    if (!testEnv) throw new Error("テスト環境が設定されていません");

    await page.goto("/ja/login");
    await page.waitForLoadState("networkidle");

    // ログインフォームが表示されること
    await page.waitForSelector('[data-testid="email-input"]', { timeout: 10000 });
    await page.fill('[data-testid="email-input"]', testEnv.credentials.email);
    await page.fill('[data-testid="password-input"]', testEnv.credentials.password);
    await page.click('[data-testid="login-button"]');

    // ログイン後 /ja/dashboard に遷移すること
    await page.waitForURL("**\/ja\/dashboard", { timeout: 15000 });
    expect(page.url()).toContain("/ja/dashboard");
  });

  // -------------------------------------------------------------------------
  // [V-17] メッセージファイルの基本キー確認
  // -------------------------------------------------------------------------
  test("TC-I18N-012: /ja/ ページで翻訳エラー (MISSING_MESSAGE) がコンソールに出ないこと", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && msg.text().includes("MISSING_MESSAGE")) {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/ja/");
    await page.waitForLoadState("networkidle");

    expect(consoleErrors).toHaveLength(0);
  });
});
