/**
 * E2Eテスト: キーボード表示時の自動スクロール (Sprint Contract #31)
 *
 * 検証対象: useScrollIntoViewOnFocus hook の実機動作
 *
 * テストケース:
 * - TC-KBS-001: swim-hub login ページ - password input フォーカス時に自動スクロール
 * - TC-KBS-002: swim-hub signup ページ - 下半分 input フォーカス時に自動スクロール
 * - TC-KBS-003: swim-hub reset-password ページ - email input フォーカス時に自動スクロール
 * - TC-KBS-004: swim-hub update-password ページ - 下半分 input フォーカス時に自動スクロール
 * - TC-KBS-005: swim-hub contact ページ - 下半分 input フォーカス時に自動スクロール
 * - TC-KBS-006: 画面上半分の input フォーカス時に不要スクロールが発生しないこと
 * - TC-KBS-007: Android Web (visualViewport 非サポート想定) でエラーが発生しないこと
 *
 * NOTE: iOS Safari の実機検証は Playwright では完全再現不可。
 *       モバイルビューポート + キーボード高さシミュレーションで代替する。
 *       実機検証は Phase B のブラウザ操作で別途実施すること。
 *
 * KNOWN DESIGN LIMITATION (TR-2):
 * `simulateKeyboard` は `window.visualViewport` を Object.defineProperty でオーバーライドするが、
 * useScrollIntoViewOnFocus hook がマウント時に登録した addEventListener のリスナーは
 * オーバーライド前の元の visualViewport オブジェクトに結びついている。
 * そのため、オーバーライド後の新しいオブジェクトに対して dispatchEvent しても
 * hook のリスナーには届かず、テストは実際のスクロール動作を検証できない。
 *
 * 将来の実装者へ: 修正方針の選択肢
 *   A) window.visualViewport をオーバーライドせず、元オブジェクトの height を
 *      Object.defineProperty で上書きした上で window.visualViewport.dispatchEvent(new Event('resize'))
 *      を呼ぶ方式に書き換える。
 *   B) Playwright の page.setViewportSize() と組み合わせてブラウザのネイティブ
 *      visualViewport resize イベントをトリガーする方式を検討する。
 * 現時点では全テストを test.skip のままとし、Developer 実装完了後に上記を踏まえて再設計すること。
 */

import { expect, test, devices } from "@playwright/test";
import { URLS } from "../config/config";

// ------------------------------------------------------------------
// モバイルビューポート設定 (iPhone 14 Pro 相当)
// ------------------------------------------------------------------
const IPHONE_14_PRO = devices["iPhone 14 Pro"];
const VIEWPORT = { width: 393, height: 852 };

// キーボード表示時の仮想ビューポート高さ (iOS Safari 実機での概算値)
// 実際の iOS Safari キーボード高さ: 約 336px (ポートレート)
const KEYBOARD_HEIGHT = 336;
const VIEWPORT_HEIGHT_WITH_KEYBOARD = VIEWPORT.height - KEYBOARD_HEIGHT; // 516px

// ------------------------------------------------------------------
// ヘルパー: モバイルビューポートでキーボード高さを visualViewport でシミュレート
// ------------------------------------------------------------------
async function simulateKeyboard(page: import("@playwright/test").Page, show: boolean) {
  const newHeight = show ? VIEWPORT_HEIGHT_WITH_KEYBOARD : VIEWPORT.height;
  await page.evaluate(
    ({ height, width }) => {
      // visualViewport をオーバーライドして resize イベントを発火させる
      Object.defineProperty(window, "visualViewport", {
        value: {
          height,
          width,
          offsetTop: 0,
          offsetLeft: 0,
          pageTop: 0,
          pageLeft: 0,
          scale: 1,
          addEventListener: window.visualViewport?.addEventListener.bind(window.visualViewport),
          removeEventListener:
            window.visualViewport?.removeEventListener.bind(window.visualViewport),
          dispatchEvent: window.visualViewport?.dispatchEvent.bind(window.visualViewport),
        },
        configurable: true,
      });
      window.visualViewport?.dispatchEvent(new Event("resize"));
    },
    { height: newHeight, width: VIEWPORT.width },
  );
}

// ------------------------------------------------------------------
// TC-KBS-001: swim-hub login - password input フォーカス時に自動スクロール
// ------------------------------------------------------------------
test.describe("TC-KBS-001: swim-hub login ページの自動スクロール", () => {
  test.use({ ...IPHONE_14_PRO, viewport: VIEWPORT });

  test.skip(
    true,
    "Developer 実装後に有効化: hook 適用確認後、data-testid または aria-label でセレクタを確定させること",
  );

  test("TC-KBS-001: password input フォーカス後にキーボード表示で自動スクロールが発火すること", async ({
    page,
  }) => {
    await page.goto(URLS.LOGIN);
    await page.waitForLoadState("networkidle");

    // password input の位置を取得
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible();

    const boundingBoxBefore = await passwordInput.boundingBox();
    expect(boundingBoxBefore).not.toBeNull();

    // input にフォーカス
    await passwordInput.focus();

    // キーボード表示をシミュレート
    await simulateKeyboard(page, true);

    // scrollIntoView が呼ばれた場合、input の画面内 Y 座標が変化する
    // (中央付近に移動するはず)
    const boundingBoxAfter = await passwordInput.boundingBox();
    expect(boundingBoxAfter).not.toBeNull();

    // スクロール後に input が可視領域内に収まっていることを確認
    // キーボード表示後のビューポート高さ内に input が収まっていること
    if (boundingBoxAfter && boundingBoxAfter.y >= 0) {
      expect(boundingBoxAfter.y).toBeLessThan(VIEWPORT_HEIGHT_WITH_KEYBOARD);
    }

    await simulateKeyboard(page, false);
  });
});

// ------------------------------------------------------------------
// TC-KBS-002: swim-hub signup - 下半分 input フォーカス時に自動スクロール
// ------------------------------------------------------------------
test.describe("TC-KBS-002: swim-hub signup ページの自動スクロール", () => {
  test.use({ ...IPHONE_14_PRO, viewport: VIEWPORT });

  test.skip(
    true,
    "Developer 実装後に有効化",
  );

  test("TC-KBS-002: signup フォーム下半分の input フォーカス時に自動スクロールが機能すること", async ({
    page,
  }) => {
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");

    const inputs = page.locator("input");
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);

    // 最後の input (通常は最下部) にフォーカス
    const lastInput = inputs.last();
    await lastInput.focus();
    await simulateKeyboard(page, true);

    const bb = await lastInput.boundingBox();
    expect(bb).not.toBeNull();
    if (bb) {
      expect(bb.y).toBeLessThan(VIEWPORT_HEIGHT_WITH_KEYBOARD);
    }

    await simulateKeyboard(page, false);
  });
});

// ------------------------------------------------------------------
// TC-KBS-003: swim-hub reset-password
// ------------------------------------------------------------------
test.describe("TC-KBS-003: swim-hub reset-password ページの自動スクロール", () => {
  test.use({ ...IPHONE_14_PRO, viewport: VIEWPORT });

  test.skip(true, "Developer 実装後に有効化");

  test("TC-KBS-003: email input フォーカス時に自動スクロールが機能すること", async ({ page }) => {
    await page.goto("/reset-password");
    await page.waitForLoadState("networkidle");

    const emailInput = page.locator('input[type="email"]').first();
    await expect(emailInput).toBeVisible();
    await emailInput.focus();
    await simulateKeyboard(page, true);

    const bb = await emailInput.boundingBox();
    expect(bb).not.toBeNull();
    if (bb) {
      expect(bb.y).toBeLessThan(VIEWPORT_HEIGHT_WITH_KEYBOARD);
    }

    await simulateKeyboard(page, false);
  });
});

// ------------------------------------------------------------------
// TC-KBS-004: swim-hub update-password
// ------------------------------------------------------------------
test.describe("TC-KBS-004: swim-hub update-password ページの自動スクロール", () => {
  test.use({ ...IPHONE_14_PRO, viewport: VIEWPORT });

  test.skip(true, "Developer 実装後に有効化 (認証済みセッションが必要)");

  test("TC-KBS-004: update-password フォームの input フォーカス時に自動スクロールが機能すること", async ({
    page,
  }) => {
    // NOTE: 認証済みセッション注入が必要。supabaseLogin() を使用すること
    await page.goto("/update-password");
    await page.waitForLoadState("networkidle");

    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible();
    await passwordInput.focus();
    await simulateKeyboard(page, true);

    const bb = await passwordInput.boundingBox();
    expect(bb).not.toBeNull();
    if (bb) {
      expect(bb.y).toBeLessThan(VIEWPORT_HEIGHT_WITH_KEYBOARD);
    }

    await simulateKeyboard(page, false);
  });
});

// ------------------------------------------------------------------
// TC-KBS-005: swim-hub contact ページ
// ------------------------------------------------------------------
test.describe("TC-KBS-005: swim-hub contact ページの自動スクロール", () => {
  test.use({ ...IPHONE_14_PRO, viewport: VIEWPORT });

  test.skip(true, "Developer 実装後に有効化");

  test("TC-KBS-005: contact フォームの下半分 input フォーカス時に自動スクロールが機能すること", async ({
    page,
  }) => {
    await page.goto("/contact");
    await page.waitForLoadState("networkidle");

    // message textarea (通常最下部) にフォーカス
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible();
    await textarea.focus();
    await simulateKeyboard(page, true);

    const bb = await textarea.boundingBox();
    expect(bb).not.toBeNull();
    if (bb) {
      expect(bb.y).toBeLessThan(VIEWPORT_HEIGHT_WITH_KEYBOARD);
    }

    await simulateKeyboard(page, false);
  });
});

// ------------------------------------------------------------------
// TC-KBS-006: 画面上半分の input フォーカス時に不要スクロールが発生しないこと
// ------------------------------------------------------------------
test.describe("TC-KBS-006: 上半分 input フォーカス時に不要スクロールなし", () => {
  test.use({ ...IPHONE_14_PRO, viewport: VIEWPORT });

  test.skip(true, "Developer 実装後に有効化");

  test("TC-KBS-006: 上半分に配置された input フォーカス時にスクロール位置が変わらないこと", async ({
    page,
  }) => {
    await page.goto(URLS.LOGIN);
    await page.waitForLoadState("networkidle");

    // email input (通常 login ページ上部) は上半分に位置する
    const emailInput = page.locator('input[type="email"]').first();
    await expect(emailInput).toBeVisible();

    const scrollYBefore = await page.evaluate(() => window.scrollY);

    await emailInput.focus();
    await simulateKeyboard(page, true);

    const scrollYAfter = await page.evaluate(() => window.scrollY);

    // 上半分の input なのでスクロール位置が大きく変化しないこと
    // (許容範囲: ±50px)
    expect(Math.abs(scrollYAfter - scrollYBefore)).toBeLessThan(50);

    await simulateKeyboard(page, false);
  });
});

// ------------------------------------------------------------------
// TC-KBS-007: visualViewport 非サポート環境でエラーが発生しないこと
// ------------------------------------------------------------------
test.describe("TC-KBS-007: visualViewport 非サポート環境の安全性", () => {
  test.use({ ...IPHONE_14_PRO, viewport: VIEWPORT });

  test.skip(true, "Developer 実装後に有効化");

  test("TC-KBS-007: visualViewport を undefined にしてもページがクラッシュしないこと", async ({
    page,
  }) => {
    // visualViewport を無効化してページにアクセス
    await page.addInitScript(() => {
      Object.defineProperty(window, "visualViewport", {
        value: undefined,
        configurable: true,
      });
    });

    await page.goto(URLS.LOGIN);
    await page.waitForLoadState("networkidle");

    // コンソールエラーがないことを確認
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    const emailInput = page.locator('input[type="email"]').first();
    await expect(emailInput).toBeVisible();
    await emailInput.focus();

    // JavaScript エラーが発生していないこと
    const jsErrors = await page.evaluate(() => {
      // ページの未捕捉エラーをチェック
      return (window as { __playwright_errors__?: string[] }).__playwright_errors__ ?? [];
    });
    expect(jsErrors).toHaveLength(0);
  });
});

// ------------------------------------------------------------------
// TC-KBS-008: 既存フォーム送信が壊れていないこと (リグレッション)
// ------------------------------------------------------------------
test.describe("TC-KBS-008: 既存フォーム送信のリグレッション確認", () => {
  test.use({ ...IPHONE_14_PRO, viewport: VIEWPORT });

  test.skip(true, "Developer 実装後に有効化");

  test("TC-KBS-008: login フォームのバリデーションが hook 追加後も正常に動作すること", async ({
    page,
  }) => {
    await page.goto(URLS.LOGIN);
    await page.waitForLoadState("networkidle");

    // 空送信でバリデーションエラーが表示されること
    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();

    // HTML5 バリデーション or カスタムエラーメッセージが表示されること
    // NOTE: swim-hub では required 属性でブラウザ標準バリデーションを使用
    const emailInput = page.locator('input[type="email"]').first();
    const validationMessage = await emailInput.evaluate(
      (el) => (el as HTMLInputElement).validationMessage,
    );
    expect(validationMessage).not.toBe("");
  });
});
