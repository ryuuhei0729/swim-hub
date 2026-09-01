/**
 * Sprint Contract: ログイン画面リデザイン E2E スペック
 *
 * Sprint Contract 検証観点 (Playwright MCP による実機検証):
 *   [V-01][V-02] メインログイン画面: ボタン出現順 Google → Apple → メール
 *   [V-03][V-04][V-05] メインログイン画面: 各ボタンの視覚スタイル
 *   [V-06] メールボタンクリック → /[locale]/login/email に遷移
 *   [V-07] ローディング中の全ボタン disabled (操作上の確認)
 *   [V-08] ?error=access_denied で画面上部にエラーバナー表示
 *   [V-09] ブラウザ戻るで /login に戻れる
 *   [V-10] /login/email に直リンクアクセスできる
 *   [V-11] メールログイン画面: メール+パスワードフォームが存在する
 *   [V-12] メールログイン画面: 空送信でバリデーション動作
 *   [V-13] メールログイン画面: 誤パスワードでエラーメッセージ表示
 *   [V-14] 「他の方法でログイン」で /login に戻る
 *   [V-15] 「パスワードを忘れた方」で /reset-password に遷移
 *   [V-16] 新規登録リンクで /signup に遷移
 *   [V-17] メールログイン成功で /dashboard に遷移 (redirect_to なし)
 *   [V-17b] ?redirect_to= 付きログイン成功で指定 URL に遷移
 *   [V-18] サインアップ画面: Google → Apple → メールの順
 *   [V-19] 認証済みで /login アクセス → /dashboard リダイレクト
 *   [V-19b] 認証済みで /login/email アクセス → /dashboard リダイレクト
 *   [V-22] i18n: /ja/login/email で日本語ラベル表示
 *   [V-23] i18n: /en/login/email で英語ラベル表示
 *   [V-24] i18n: MISSING_MESSAGE が /login/email でコンソールに出ない
 *
 * ブラウザ操作: Playwright MCP
 * 前提: dev server が http://localhost:3000 で起動済み
 * 環境変数: E2E_EMAIL, E2E_PASSWORD, E2E_BASE_URL
 *
 * NOTE: このファイルはテストスケルトン。
 *       実装完了後に Phase B で具体的な操作・アサーションを実装する。
 */

import { expect, test, type Page } from "@playwright/test";
import { EnvConfig, URLS } from "../config/config";

// ---------------------------------------------------------------------------
// 環境変数チェック
// ---------------------------------------------------------------------------

let hasRequiredEnvVars = false;
let testEnv: ReturnType<typeof EnvConfig.getTestEnvironment> | null = null;
try {
  testEnv = EnvConfig.getTestEnvironment();
  hasRequiredEnvVars = true;
} catch {
  // E2E 認証情報が不要なテストは個別に skip しない
}

// ---------------------------------------------------------------------------
// URL 定数 (Sprint Contract で新設)
// ---------------------------------------------------------------------------

const LOGIN_EMAIL_URL = "/ja/login/email";
const EN_LOGIN_EMAIL_URL = "/en/login/email";

// ---------------------------------------------------------------------------
// ヘルパー: MISSING_MESSAGE リスナー
// ---------------------------------------------------------------------------

function setupMissingMessageListener(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().includes("MISSING_MESSAGE")) {
      errors.push(msg.text());
    }
  });
  return () => errors;
}

// ---------------------------------------------------------------------------
// [V-01][V-02][V-03][V-04][V-05] メインログイン画面の視覚階層
// ---------------------------------------------------------------------------

test.describe("メインログイン画面 (/ja/login) の視覚階層", () => {
  test("TC-LR-001: Google → Apple → メール の順でボタンが出現し、各スタイルが正しい", async ({
    page,
  }) => {
    // TODO: 実装後に以下の操作で検証する
    // await page.goto(URLS.LOGIN);
    // await page.waitForLoadState("networkidle");
    //
    // ボタンの存在確認
    // const googleBtn = page.getByTestId("google-signin-button");
    // const appleBtn = page.getByTestId("apple-signin-button");
    // const emailBtn = page.getByTestId("email-signin-button");
    // await expect(googleBtn).toBeVisible();
    // await expect(appleBtn).toBeVisible();
    // await expect(emailBtn).toBeVisible();
    //
    // DOM 上の順序確認
    // const allTestIds = await page.locator("[data-testid]").evaluateAll(
    //   els => els.map(e => e.getAttribute("data-testid"))
    // );
    // const googleIdx = allTestIds.indexOf("google-signin-button");
    // const appleIdx = allTestIds.indexOf("apple-signin-button");
    // const emailIdx = allTestIds.indexOf("email-signin-button");
    // expect(googleIdx).toBeLessThan(appleIdx);
    // expect(appleIdx).toBeLessThan(emailIdx);
    //
    // スタイル確認
    // const googleClass = await googleBtn.getAttribute("class");
    // expect(googleClass).toContain("bg-white");
    // expect(googleClass).toMatch(/border/);
    //
    // const appleClass = await appleBtn.getAttribute("class");
    // expect(appleClass).toContain("bg-black");
    //
    // const emailClass = await emailBtn.getAttribute("class");
    // expect(emailClass).not.toContain("bg-black");
    // expect(emailClass).not.toMatch(/bg-blue|bg-indigo/);
    // expect(emailClass).toMatch(/border/);
    test.skip(true, "Phase B: 実装後に有効化する");
  });
});

// ---------------------------------------------------------------------------
// [V-06] メールボタンクリック → /login/email 遷移
// ---------------------------------------------------------------------------

test.describe("[V-06] メールボタンクリックでメール専用ログイン画面へ遷移", () => {
  test("TC-LR-002: /ja/login でメールボタンをクリックすると /ja/login/email に遷移する", async ({
    page,
  }) => {
    // TODO:
    // await page.goto(URLS.LOGIN);
    // await page.waitForLoadState("networkidle");
    // await page.getByTestId("email-signin-button").click();
    // await page.waitForURL("**/ja/login/email**", { timeout: 10000 });
    // expect(page.url()).toContain("/ja/login/email");
    test.skip(true, "Phase B: 実装後に有効化する");
  });

  test("TC-LR-003: ?redirect_to= が /login/email URL に引き継がれ、二重 locale プレフィックスにならない", async ({
    page,
  }) => {
    // バグ1回帰確認 (二重 locale プレフィックス 404): /login の emailHref
    // (login/page.tsx) は `@/i18n/navigation` の Link で組み立てられる。
    // redirect_to が locale 付き (/ja/dashboard) のまま query string に埋め込まれても、
    // Link 自体の href ("/login/email?redirect_to=...") には locale が含まれないため
    // ここでの遷移では二重 prefix は起きない想定だが、実機で /ja/ja/... に
    // ならないことを直接確認する。
    await page.goto(`${URLS.LOGIN}?redirect_to=${encodeURIComponent("/ja/dashboard")}`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("email-signin-button").click();
    await page.waitForURL("**/login/email**");

    const url = new URL(page.url());
    // redirect_to パラメータが引き継がれていること (デコードして完全一致で確認する。
    // toContain は "redirect_to" という文字列の有無しか見ないため使わない)
    expect(url.searchParams.get("redirect_to")).toBe("/ja/dashboard");
    // 二重 locale プレフィックス (/ja/ja/...) になっていないこと
    expect(url.pathname).not.toMatch(/\/ja\/ja\//);
    expect(url.pathname).toBe("/ja/login/email");
  });
});

// ---------------------------------------------------------------------------
// [V-08] ?error= パラメータによるエラーバナー (既存動作維持)
// ---------------------------------------------------------------------------

test.describe("[V-08] ?error= パラメータでエラーバナーが /login 画面上部に表示される", () => {
  test("TC-LR-004: ?error=access_denied でエラーバナーが画面上部に表示される", async ({
    page,
  }) => {
    // TODO:
    // await page.goto(`${URLS.LOGIN}?error=access_denied`);
    // await page.waitForLoadState("networkidle");
    // const errorBanner = page.locator(".bg-red-50").first();
    // await expect(errorBanner).toBeVisible();
    // // 上部配置: absolute top-4 など
    // const boundingBox = await errorBanner.boundingBox();
    // expect(boundingBox?.y).toBeLessThan(200); // 画面上部200px以内
    test.skip(true, "Phase B: 実装後に有効化する");
  });

  test("TC-LR-005: ?error= なしではエラーバナーが表示されない", async ({ page }) => {
    // TODO:
    // await page.goto(URLS.LOGIN);
    // await page.waitForLoadState("networkidle");
    // await expect(page.locator(".bg-red-50")).not.toBeVisible();
    test.skip(true, "Phase B: 実装後に有効化する");
  });
});

// ---------------------------------------------------------------------------
// [V-09] ブラウザ戻るで /login に戻る
// ---------------------------------------------------------------------------

test.describe("[V-09] ブラウザ戻るで /login に戻れる", () => {
  test("TC-LR-006: /login/email からブラウザ戻るで /login に戻る", async ({ page }) => {
    // TODO:
    // await page.goto(URLS.LOGIN);
    // await page.waitForLoadState("networkidle");
    // await page.getByTestId("email-signin-button").click();
    // await page.waitForURL("**/login/email**");
    // await page.goBack();
    // await page.waitForURL("**/login**");
    // expect(page.url()).toContain("/ja/login");
    // expect(page.url()).not.toContain("/login/email");
    test.skip(true, "Phase B: 実装後に有効化する");
  });
});

// ---------------------------------------------------------------------------
// [V-10] /login/email への直リンクアクセス
// ---------------------------------------------------------------------------

test.describe("[V-10] /login/email に直接アクセスできる", () => {
  test("TC-LR-007: /ja/login/email に直リンクでアクセスするとフォームが表示される", async ({
    page,
  }) => {
    // TODO:
    // await page.goto(LOGIN_EMAIL_URL);
    // await page.waitForLoadState("networkidle");
    // await expect(page.getByTestId("email-input")).toBeVisible();
    // await expect(page.getByTestId("password-input")).toBeVisible();
    // await expect(page.getByTestId("login-button")).toBeVisible();
    test.skip(true, "Phase B: 実装後に有効化する");
  });
});

// ---------------------------------------------------------------------------
// [V-11][V-12][V-13] メールログイン画面のフォーム機能
// ---------------------------------------------------------------------------

test.describe("メールログイン画面 (/ja/login/email) のフォーム機能", () => {
  test("TC-LR-008: [V-11] メール+パスワードフォームが表示される", async ({ page }) => {
    // TODO:
    // await page.goto(LOGIN_EMAIL_URL);
    // await page.waitForLoadState("networkidle");
    // await expect(page.getByTestId("email-input")).toBeVisible();
    // await expect(page.getByTestId("password-input")).toBeVisible();
    // await expect(page.getByTestId("login-button")).toBeVisible();
    test.skip(true, "Phase B: 実装後に有効化する");
  });

  test("TC-LR-009: [V-12] 空送信でバリデーションエラーが発生する (required 属性またはエラー表示)", async ({
    page,
  }) => {
    // TODO:
    // await page.goto(LOGIN_EMAIL_URL);
    // await page.waitForLoadState("networkidle");
    // await page.getByTestId("login-button").click();
    // // HTML5 required バリデーションが働くか、または .bg-red-50 エラーが表示される
    // const emailInput = page.getByTestId("email-input");
    // const validationMessage = await emailInput.evaluate((el: HTMLInputElement) => el.validationMessage);
    // expect(validationMessage).not.toBe("");
    // // OR: await expect(page.locator(".bg-red-50")).toBeVisible();
    test.skip(true, "Phase B: 実装後に有効化する");
  });

  test("TC-LR-010: [V-13] 誤パスワードで invalidCredentials エラーメッセージが表示される", async ({
    page,
  }) => {
    test.skip(!hasRequiredEnvVars, "E2E_EMAIL, E2E_PASSWORD が未設定");
    // TODO:
    // await page.goto(LOGIN_EMAIL_URL);
    // await page.waitForLoadState("networkidle");
    // await page.getByTestId("email-input").fill(testEnv!.credentials.email);
    // await page.getByTestId("password-input").fill("wrong-password-123456");
    // await page.getByTestId("login-button").click();
    // const errorEl = page.locator(".bg-red-50");
    // await expect(errorEl).toBeVisible({ timeout: 10000 });
    // expect(page.url()).toContain("/login/email");
    test.skip(true, "Phase B: 実装後に有効化する");
  });
});

// ---------------------------------------------------------------------------
// [V-14][V-15][V-16] メールログイン画面のナビゲーションリンク
// ---------------------------------------------------------------------------

test.describe("メールログイン画面 (/ja/login/email) のナビゲーションリンク", () => {
  test("TC-LR-011: [V-14] 「他の方法でログイン」クリックで /ja/login に戻る", async ({
    page,
  }) => {
    // TODO:
    // await page.goto(LOGIN_EMAIL_URL);
    // await page.waitForLoadState("networkidle");
    // await page.getByTestId("back-to-login-options-link").click();
    // await page.waitForURL("**/ja/login**");
    // expect(page.url()).toContain("/ja/login");
    // expect(page.url()).not.toContain("/login/email");
    test.skip(true, "Phase B: 実装後に有効化する");
  });

  test("TC-LR-012: [V-15] 「パスワードを忘れた方」クリックで /ja/reset-password に遷移", async ({
    page,
  }) => {
    // TODO:
    // await page.goto(LOGIN_EMAIL_URL);
    // await page.waitForLoadState("networkidle");
    // await page.getByTestId("forgot-password-link").click();
    // await page.waitForURL("**/reset-password**");
    // expect(page.url()).toContain("/ja/reset-password");
    test.skip(true, "Phase B: 実装後に有効化する");
  });

  test("TC-LR-013: [V-16] 新規登録リンクが /signup を指す (控えめな表示)", async ({ page }) => {
    // TODO:
    // await page.goto(LOGIN_EMAIL_URL);
    // await page.waitForLoadState("networkidle");
    // const signupLink = page.locator('[href*="/signup"]').first();
    // await expect(signupLink).toBeVisible();
    // await expect(signupLink).toHaveAttribute("href", expect.stringContaining("/signup"));
    // // 控えめな表示: ボタンではなくリンク、またはゴーストスタイル
    test.skip(true, "Phase B: 実装後に有効化する");
  });
});

// ---------------------------------------------------------------------------
// [V-17] メールログイン成功フロー
// ---------------------------------------------------------------------------

test.describe("[V-17] メールログイン成功フロー", () => {
  test("TC-LR-014: [V-17] 正しい認証情報でログイン → /dashboard に遷移する", async ({
    page,
  }) => {
    test.skip(!hasRequiredEnvVars, "E2E_EMAIL, E2E_PASSWORD が未設定");
    // TODO:
    // await page.goto(LOGIN_EMAIL_URL);
    // await page.waitForLoadState("networkidle");
    // await page.getByTestId("email-input").fill(testEnv!.credentials.email);
    // await page.getByTestId("password-input").fill(testEnv!.credentials.password);
    // await page.getByTestId("login-button").click();
    // await page.waitForSelector('[data-testid="calendar"]', { timeout: 15000 });
    // expect(page.url()).toContain("/dashboard");
    test.skip(true, "Phase B: 実装後に有効化する");
  });

  test("TC-LR-015: [V-17b] ?redirect_to= 付きでログイン成功 → 指定 URL に遷移する (二重 locale プレフィックス404の回帰確認)", async ({
    page,
  }) => {
    test.skip(!hasRequiredEnvVars, "E2E_EMAIL, E2E_PASSWORD が未設定");
    // バグ1本体の回帰確認: middleware が redirect_to=/ja/mypage (locale付き) で
    // /ja/login にリダイレクトした場合と同じ状況を、/login/email に
    // ?redirect_to=/ja/mypage (locale付き) を直接付与して再現する。
    // 修正前は EmailSignInForm が getSafeRedirectUrl の戻り値をそのまま
    // @/i18n/navigation の router.push に渡すため、next-intl の localizeHref が
    // 既に locale 付きの "/ja/mypage" にもう一段 prefix を足し "/ja/ja/mypage" になり
    // 404 (app/[locale]/ja/mypage は存在しない) になる。
    await page.goto(`${LOGIN_EMAIL_URL}?redirect_to=${encodeURIComponent("/ja/mypage")}`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("email-input").fill(testEnv!.credentials.email);
    await page.getByTestId("password-input").fill(testEnv!.credentials.password);
    await page.getByTestId("login-button").click();

    // 404 に落ちず、意図した /ja/mypage に到達すること。
    // waitForURL は "/ja/ja/mypage" でも "**/mypage**" にマッチしてしまい
    // 誤検出になるため、pathname の完全一致で待つ。
    // 項目5 (Sprint Contract, Phase A): playwright.config.ts:132 の
    // navigationTimeout グローバル既定が 15000 のため、この明示指定 (15000) は
    // 実質 no-op で、ローカル実行時の flaky の原因になっていた。25000 に
    // 引き上げて初めて意味を持つ (CI は本番ビルドのため原理的に再現しない)。
    await page.waitForURL((url) => url.pathname === "/ja/mypage", { timeout: 25000 });

    const finalUrl = new URL(page.url());
    expect(finalUrl.pathname).not.toMatch(/\/ja\/ja\//);
    expect(finalUrl.pathname).toBe("/ja/mypage");
  });

  test("TC-LR-015b: [Reviewer Critical再検証] redirect_to 自体が二重 locale (/ja/ja/mypage) でもログイン成功後に /ja/mypage に到達する (404が再発しない)", async ({
    page,
  }) => {
    test.skip(!hasRequiredEnvVars, "E2E_EMAIL, E2E_PASSWORD が未設定");
    // Reviewer Critical指摘の再現: stripLocale は1レイヤーしか剥がさないため、
    // redirect_to 自体が既に二重 locale (/ja/ja/mypage) だった場合、
    // 1回だけ適用する実装だと /ja/mypage まで剥がれず /ja/dashboard 相当の
    // 剥がし残しが残り、push 後に next-intl がもう一段 prefix を足して
    // 再び /ja/ja/mypage に戻り 404 になる (resolveSafeLocalRedirect 導入前の穴)。
    // resolveSafeLocalRedirect は剥がし切るまでループするため、
    // 最終的に /ja/mypage (1層) に到達するはず。
    await page.goto(`${LOGIN_EMAIL_URL}?redirect_to=${encodeURIComponent("/ja/ja/mypage")}`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("email-input").fill(testEnv!.credentials.email);
    await page.getByTestId("password-input").fill(testEnv!.credentials.password);
    await page.getByTestId("login-button").click();

    // "**/mypage**" だと /ja/ja/mypage にもマッチしてしまうため、pathname の
    // 完全一致で待つ (剥がし残しの検出漏れを防ぐ)。
    // 項目5 (Sprint Contract, Phase A): 上の TC-LR-015 と同じ理由で 25000 に引き上げる。
    await page.waitForURL((url) => url.pathname === "/ja/mypage", { timeout: 25000 });

    const finalUrl = new URL(page.url());
    expect(finalUrl.pathname).not.toMatch(/\/ja\/ja\//);
    expect(finalUrl.pathname).toBe("/ja/mypage");
  });
});

// ---------------------------------------------------------------------------
// [V-18] サインアップ画面の視覚階層
// ---------------------------------------------------------------------------

test.describe("[V-18] サインアップ画面 (/ja/signup) の視覚階層", () => {
  test("TC-LR-016: Google → Apple → メール の順でボタンが出現する", async ({ page }) => {
    // TODO:
    // await page.goto(URLS.SIGNUP);
    // await page.waitForLoadState("networkidle");
    // const allTestIds = await page.locator("[data-testid]").evaluateAll(
    //   els => els.map(e => e.getAttribute("data-testid"))
    // );
    // const googleIdx = allTestIds.indexOf("google-signin-button");
    // const appleIdx = allTestIds.indexOf("apple-signin-button");
    // const emailIdx = allTestIds.indexOf("email-signin-button");
    // expect(googleIdx).toBeLessThan(appleIdx);
    // expect(appleIdx).toBeLessThan(emailIdx);
    test.skip(true, "Phase B: 実装後に有効化する");
  });
});

// ---------------------------------------------------------------------------
// [V-19] 認証済みユーザーの /login, /login/email, /signup へのアクセス
// ---------------------------------------------------------------------------

// NOTE: 認証済み状態のテストは E2E_EMAIL/E2E_PASSWORD が必要
test.describe("[V-19] 認証済みユーザーが login 系ページにアクセスすると /dashboard にリダイレクトされる", () => {
  test("TC-LR-017: 認証済みで /ja/login → /ja/dashboard にリダイレクト", async ({ page }) => {
    test.skip(!hasRequiredEnvVars, "E2E_EMAIL, E2E_PASSWORD が未設定");
    // TODO: supabase-login ヘルパーでログイン状態を作成してから /login にアクセス
    // expect(page.url()).toContain("/dashboard");
    test.skip(true, "Phase B: 実装後に有効化する");
  });

  test("TC-LR-018: [V-19b] 認証済みで /ja/login/email → /ja/dashboard にリダイレクト", async ({
    page,
  }) => {
    test.skip(!hasRequiredEnvVars, "E2E_EMAIL, E2E_PASSWORD が未設定");
    // TODO: 認証済み状態で /ja/login/email にアクセス → /dashboard リダイレクト確認
    test.skip(true, "Phase B: 実装後に有効化する");
  });

  test("TC-LR-019: 認証済みで /ja/signup → /ja/dashboard にリダイレクト", async ({ page }) => {
    test.skip(!hasRequiredEnvVars, "E2E_EMAIL, E2E_PASSWORD が未設定");
    // TODO: 認証済み状態で /ja/signup にアクセス → /dashboard リダイレクト確認
    test.skip(true, "Phase B: 実装後に有効化する");
  });
});

// ---------------------------------------------------------------------------
// [V-22][V-23][V-24] /login/email の i18n
// ---------------------------------------------------------------------------

test.describe("/login/email の i18n", () => {
  test("TC-LR-020: [V-22] /ja/login/email でフォームラベルが日本語", async ({ page }) => {
    const getErrors = setupMissingMessageListener(page);
    // TODO:
    // await page.goto(LOGIN_EMAIL_URL);
    // await page.waitForLoadState("networkidle");
    // expect(await page.getAttribute("html", "lang")).toBe("ja");
    // await expect(page.locator('label[for="email"]').first()).toContainText(/メールアドレス/);
    // await expect(page.locator('label[for="password"]').first()).toContainText(/パスワード/);
    // expect(getErrors()).toHaveLength(0);
    test.skip(true, "Phase B: 実装後に有効化する");
  });

  test("TC-LR-021: [V-23] /en/login/email でフォームラベルが英語", async ({ page }) => {
    const getErrors = setupMissingMessageListener(page);
    // TODO:
    // await page.goto(EN_LOGIN_EMAIL_URL);
    // await page.waitForLoadState("networkidle");
    // expect(await page.getAttribute("html", "lang")).toBe("en");
    // await expect(page.locator('label[for="email"]').first()).toContainText(/Email/i);
    // const formText = await page.locator("form").textContent();
    // expect(formText).not.toMatch(/[ぁ-ん]/);
    // expect(getErrors()).toHaveLength(0);
    test.skip(true, "Phase B: 実装後に有効化する");
  });

  test("TC-LR-022: [V-24] 5言語で /login/email の MISSING_MESSAGE がコンソールに出ない", async ({
    page,
  }) => {
    const getErrors = setupMissingMessageListener(page);
    const locales = ["ja", "en", "ko", "zh", "de"];
    for (const locale of locales) {
      // TODO:
      // await page.goto(`/${locale}/login/email`);
      // await page.waitForLoadState("networkidle");
    }
    // expect(getErrors()).toHaveLength(0);
    test.skip(true, "Phase B: 実装後に有効化する");
  });
});
