/**
 * Phase 1-B: i18n unauthenticated pages E2E スモークテスト
 *
 * Sprint Contract 検証観点:
 *   [V-30] /ja/login で login フォームラベルが日本語
 *   [V-31] /en/login で login フォームラベルが英語
 *   [V-32] /ja/ で LP hero テキストが日本語
 *   [V-33] /en/ で LP hero テキストが英語
 *   [V-34] LanguageSwitcher クリック → 同一パスの別ロケール URL に遷移 + テキスト切替
 *   [V-35] MISSING_MESSAGE がコンソールに出ない (/ja/, /en/, /ja/login, /en/login)
 *   [V-36] /ja/reset-password で日本語 UI
 *   [V-37] /en/reset-password で英語 UI
 *   [V-38] pricing ページ /ja/pricing / /en/pricing でロケール別 UI
 *   [V-39] /ja/contact と /en/contact でフォームラベルが切り替わる
 *
 * ブラウザ操作: Playwright MCP
 * 前提: dev server が http://localhost:3000 で起動済み
 */

import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/**
 * MISSING_MESSAGE コンソールエラーを収集するリスナーを設定する
 */
function setupMissingMessageListener(page: import("@playwright/test").Page): () => string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().includes("MISSING_MESSAGE")) {
      errors.push(msg.text());
    }
  });
  return () => errors;
}

// ---------------------------------------------------------------------------
// [V-30] [V-31] login ページのフォームラベル
// ---------------------------------------------------------------------------

test.describe("login ページのロケール別 UI", () => {
  test("TC-I18N-B-001: /ja/login でフォームラベルが日本語", async ({ page }) => {
    const getErrors = setupMissingMessageListener(page);

    await page.goto("/ja/login");
    await page.waitForLoadState("networkidle");

    // html lang 属性
    expect(await page.getAttribute("html", "lang")).toBe("ja");

    // メールアドレスラベルが日本語
    const emailLabel = page.locator('label[for="email"]').first();
    await expect(emailLabel).toContainText(/メールアドレス/);

    // パスワードラベルが日本語
    const passwordLabel = page.locator('label[for="password"]').first();
    await expect(passwordLabel).toContainText(/パスワード/);

    // ログインボタンが日本語
    const loginButton = page.getByTestId("login-button");
    await expect(loginButton).toContainText(/ログイン/);

    // MISSING_MESSAGE がないこと
    expect(getErrors()).toHaveLength(0);
  });

  test("TC-I18N-B-002: /en/login でフォームラベルが英語", async ({ page }) => {
    const getErrors = setupMissingMessageListener(page);

    await page.goto("/en/login");
    await page.waitForLoadState("networkidle");

    // html lang 属性
    expect(await page.getAttribute("html", "lang")).toBe("en");

    // メールラベルが英語
    const emailLabel = page.locator('label[for="email"]').first();
    await expect(emailLabel).toContainText(/Email/i);

    // パスワードラベルが英語
    const passwordLabel = page.locator('label[for="password"]').first();
    await expect(passwordLabel).toContainText(/Password/i);

    // Sign In ボタンが英語
    const loginButton = page.getByTestId("login-button");
    await expect(loginButton).toContainText(/Sign In/i);

    // ラベルに日本語が含まれないこと
    const pageText = await page.locator("form").textContent();
    expect(pageText).not.toMatch(/[ぁ-ん]/);

    // MISSING_MESSAGE がないこと
    expect(getErrors()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// [V-32] [V-33] LP (トップページ) の hero テキスト
// ---------------------------------------------------------------------------

test.describe("LP (トップページ) のロケール別 UI", () => {
  test("TC-I18N-B-003: /ja/ で LP hero テキストが日本語", async ({ page }) => {
    const getErrors = setupMissingMessageListener(page);

    await page.goto("/ja/");
    await page.waitForLoadState("networkidle");

    expect(await page.getAttribute("html", "lang")).toBe("ja");

    // hero section に日本語テキストが存在する
    const heroSection = page.locator("section").first();
    const heroText = await heroSection.textContent();
    expect(heroText).toMatch(/[ぁ-ん]/);

    // 無料登録ボタンが日本語
    const signupButtons = page.locator('a[href*="signup"]');
    const firstSignupButton = signupButtons.first();
    await expect(firstSignupButton).toContainText(/無料登録/);

    expect(getErrors()).toHaveLength(0);
  });

  test("TC-I18N-B-004: /en/ で LP hero テキストが英語", async ({ page }) => {
    const getErrors = setupMissingMessageListener(page);

    await page.goto("/en/");
    await page.waitForLoadState("networkidle");

    expect(await page.getAttribute("html", "lang")).toBe("en");

    // hero section に英語テキストが存在する (日本語が含まれない)
    // NOTE: 固有名詞 "SwimHub" は両言語に含まれる
    const heroSection = page.locator("section").first();
    const heroText = await heroSection.textContent();
    // ひらがな/カタカナが含まれないこと
    expect(heroText).not.toMatch(/[ぁ-んァ-ン]/);

    // 登録ボタンが英語
    const signupButton = page.locator('a[href*="signup"]').first();
    const buttonText = await signupButton.textContent();
    expect(buttonText).not.toMatch(/[ぁ-ん]/);

    expect(getErrors()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// [V-34] LanguageSwitcher でのロケール切り替え (LP で確認)
// ---------------------------------------------------------------------------

test.describe("LanguageSwitcher でのロケール切り替え (unauthenticated)", () => {
  test("TC-I18N-B-005: /ja/ で EN をクリック → /en/ に遷移してテキストが英語に切り替わる", async ({
    page,
  }) => {
    await page.goto("/ja/");
    await page.waitForLoadState("networkidle");

    // LanguageSwitcher の EN ボタンを探してクリック
    const enSwitcher = page
      .locator(
        '[data-testid="language-switcher-en"], button:has-text("EN"), a:has-text("EN")',
      )
      .first();
    await enSwitcher.waitFor({ state: "visible", timeout: 10000 });
    await enSwitcher.click();

    // /en/ に遷移すること
    await page.waitForURL("**/en/**", { timeout: 10000 });
    expect(page.url()).toContain("/en/");

    // html lang が en になること
    expect(await page.getAttribute("html", "lang")).toBe("en");
  });

  test("TC-I18N-B-006: /en/ で JA をクリック → /ja/ に遷移してテキストが日本語に切り替わる", async ({
    page,
  }) => {
    await page.goto("/en/");
    await page.waitForLoadState("networkidle");

    // LanguageSwitcher の JA ボタンを探してクリック
    const jaSwitcher = page
      .locator(
        '[data-testid="language-switcher-ja"], button:has-text("JA"), a:has-text("JA")',
      )
      .first();
    await jaSwitcher.waitFor({ state: "visible", timeout: 10000 });
    await jaSwitcher.click();

    // /ja/ に遷移すること
    await page.waitForURL("**/ja/**", { timeout: 10000 });
    expect(page.url()).toContain("/ja/");

    // html lang が ja になること
    expect(await page.getAttribute("html", "lang")).toBe("ja");
  });

  test("TC-I18N-B-007: /ja/login で EN をクリック → /en/login に遷移 (同一パス保持)", async ({
    page,
  }) => {
    await page.goto("/ja/login");
    await page.waitForLoadState("networkidle");

    const enSwitcher = page
      .locator(
        '[data-testid="language-switcher-en"], button:has-text("EN"), a:has-text("EN")',
      )
      .first();
    await enSwitcher.waitFor({ state: "visible", timeout: 10000 });
    await enSwitcher.click();

    // /en/login に遷移すること (login パスが保持される)
    await page.waitForURL("**/en/login**", { timeout: 10000 });
    expect(page.url()).toContain("/en/login");
  });
});

// ---------------------------------------------------------------------------
// [V-35] MISSING_MESSAGE がコンソールに出ない (複数ページ確認)
// ---------------------------------------------------------------------------

test.describe("[V-35] MISSING_MESSAGE コンソールエラーなし", () => {
  const pagesToCheck = [
    { path: "/ja/", label: "ja LP" },
    { path: "/en/", label: "en LP" },
    { path: "/ja/login", label: "ja login" },
    { path: "/en/login", label: "en login" },
    { path: "/ja/signup", label: "ja signup" },
    { path: "/en/signup", label: "en signup" },
    { path: "/ja/reset-password", label: "ja reset-password" },
    { path: "/en/reset-password", label: "en reset-password" },
  ];

  for (const { path, label } of pagesToCheck) {
    test(`TC-I18N-B-008-${label}: ${path} で MISSING_MESSAGE がコンソールに出ない`, async ({
      page,
    }) => {
      const getErrors = setupMissingMessageListener(page);

      await page.goto(path);
      await page.waitForLoadState("networkidle");

      expect(
        getErrors(),
        `${path} で MISSING_MESSAGE エラーが検出されました: ${getErrors().join(", ")}`,
      ).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-36] [V-37] reset-password ページの UI
// ---------------------------------------------------------------------------

test.describe("reset-password ページのロケール別 UI", () => {
  test("TC-I18N-B-009: /ja/reset-password で日本語 UI", async ({ page }) => {
    await page.goto("/ja/reset-password");
    await page.waitForLoadState("networkidle");

    // タイトルが日本語
    const heading = page.locator("h2").first();
    await expect(heading).toContainText(/パスワードリセット/);

    // メールラベルが日本語
    const emailLabel = page.locator('label[for="email"]').first();
    await expect(emailLabel).toContainText(/メールアドレス/);

    // 送信ボタンが日本語
    const submitButton = page.locator('button[type="submit"]').first();
    await expect(submitButton).toContainText(/リセット|送信/);
  });

  test("TC-I18N-B-010: /en/reset-password で英語 UI", async ({ page }) => {
    await page.goto("/en/reset-password");
    await page.waitForLoadState("networkidle");

    // タイトルが英語
    const heading = page.locator("h2").first();
    const headingText = await heading.textContent();
    expect(headingText).not.toMatch(/[ぁ-ん]/);
    expect(headingText).toMatch(/Reset|Password/i);

    // メールラベルが英語
    const emailLabel = page.locator('label[for="email"]').first();
    await expect(emailLabel).toContainText(/Email/i);
  });
});

// ---------------------------------------------------------------------------
// [V-38] pricing ページのロケール別 UI
// ---------------------------------------------------------------------------

test.describe("pricing ページのロケール別 UI", () => {
  test("TC-I18N-B-011: /ja/pricing でページタイトルが日本語", async ({ page }) => {
    await page.goto("/ja/pricing");
    await page.waitForLoadState("networkidle");

    // h1 が日本語
    const h1 = page.locator("h1").first();
    await expect(h1).toContainText(/料金プラン/);

    // 「無料で始める」ボタンが日本語
    const startButton = page.locator('a[href*="signup"]').first();
    const buttonText = await startButton.textContent();
    expect(buttonText).not.toMatch(/^[A-Za-z]/);
  });

  test("TC-I18N-B-012: /en/pricing でページタイトルが英語", async ({ page }) => {
    await page.goto("/en/pricing");
    await page.waitForLoadState("networkidle");

    // h1 が英語 (日本語でない)
    const h1 = page.locator("h1").first();
    const h1Text = await h1.textContent();
    expect(h1Text).not.toMatch(/[ぁ-ん]/);
    expect(h1Text).toMatch(/Plan|Pricing/i);
  });
});

// ---------------------------------------------------------------------------
// [V-39] contact フォームのラベル切り替え
// ---------------------------------------------------------------------------

test.describe("contact ページのロケール別 UI", () => {
  test("TC-I18N-B-013: /ja/contact でフォームラベルが日本語", async ({ page }) => {
    await page.goto("/ja/contact");
    await page.waitForLoadState("networkidle");

    // 件名セレクトボックスの placeholder が日本語
    const subjectSelect = page.locator('select[name="subject"]');
    const firstOption = subjectSelect.locator('option').first();
    await expect(firstOption).toContainText(/選択してください/);
  });

  test("TC-I18N-B-014: /en/contact でフォームラベルが英語", async ({ page }) => {
    await page.goto("/en/contact");
    await page.waitForLoadState("networkidle");

    // ページのフォームエリアに日本語が含まれないこと
    const formLabels = await page.locator("label").allTextContents();
    for (const label of formLabels) {
      expect(label, `ラベル "${label}" に日本語が含まれています`).not.toMatch(/[ぁ-ん]/);
    }
  });
});
