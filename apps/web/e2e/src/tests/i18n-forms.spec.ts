/**
 * Phase 1-C-D: shared forms i18n E2E テスト
 *
 * Sprint Contract 検証観点:
 *   [V-CD-E01] /en/dashboard でカレンダーの「+」をクリック → 予定を作成モーダルが英語表示
 *   [V-CD-E02] 予定を作成モーダル内のステッパー、フィールドラベル、ボタンが英語
 *   [V-CD-E03] 予定を作成モーダルでメモを入力してキャンセル → ConfirmDialog (未保存変更) が英語
 *   [V-CD-E04] /en/dashboard で大会情報登録モーダルが英語表示 (ステッパー・フィールド・ボタン)
 *   [V-CD-E05] /en/dashboard で TagInput が英語表示 (placeholder など)
 *   [V-CD-E06] /en/dashboard で ImageUploader が英語表示 (ラベル・ドラッグ&ドロップテキスト)
 *   [V-CD-E07] /ja/dashboard で予定を作成モーダルが日本語表示のまま維持
 *   [V-CD-E08] /ja/dashboard で大会情報登録モーダルが日本語表示のまま維持
 *   [V-CD-E09] /en/dashboard で MISSING_MESSAGE コンソールエラーが 0 件
 *   [V-CD-E10] /ja/dashboard で MISSING_MESSAGE コンソールエラーが 0 件
 *   [V-CD-E11] LanguageSwitcher で ja → en 切り替え後にモーダルを開くと英語表示
 *
 * 実装方針:
 *   - dev server が http://localhost:3000 で起動済みであること
 *   - テスト用アカウントでログインして検証
 *   - MISSING_MESSAGE コンソールエラーが 0 件であることを各テストで確認
 *
 * NOTE (Phase A スケルトン):
 *   - 各テストは test.fixme() としておく
 *   - Phase B (Developer 実装完了後) に QA が実際の操作手順を実装する
 *   - ログイン処理は既存の config/config.ts ヘルパーを利用する
 *
 * ブラウザ操作: Playwright MCP
 * 前提: dev server が http://localhost:3000 で起動済み
 * 関連ファイル:
 *   - e2e/src/config/config.ts (環境変数・URL 定義)
 *   - e2e/src/tests/i18n-routing.spec.ts (ログインヘルパーの参考)
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
} catch (error) {
  console.error(
    "環境変数の検証に失敗しました:",
    error instanceof Error ? error.message : error,
  );
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

/**
 * MISSING_MESSAGE コンソールエラーを収集するリスナーを設定する
 */
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
// [V-CD-E01] [V-CD-E02] 予定を作成モーダルの英語表示
// ---------------------------------------------------------------------------

test.describe("予定を作成モーダルの英語表示 (PracticeBasicForm)", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD を設定してください。",
  );

  test.fixme(
    "TC-CD-001: /en/dashboard でカレンダーの「+」クリック → 予定を作成モーダルが英語表示",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン
      // 2. await page.goto("/en/dashboard")
      // 3. await page.waitForLoadState("networkidle")
      // 4. カレンダーの日付セルまたは「+」ボタンをクリック (aria-label や data-testid を利用)
      // 5. モーダルが開くのを待つ: await page.waitForSelector('[role="dialog"]')
      // 6. モーダルタイトルが英語 ("Create Practice" 等) であることを確認
      //    expect(await page.textContent('[role="dialog"] h2')).toMatch(/create|practice/i)
      // 7. MISSING_MESSAGE エラーが 0 件であることを確認
      const getErrors = setupMissingMessageListener(page);
      void getErrors;
      expect(testEnv).not.toBeNull();
    },
  );

  test.fixme(
    "TC-CD-002: 予定を作成モーダルのステッパーが英語表示",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン → /en/dashboard → 予定を作成モーダルを開く
      // 2. FormStepper のステップラベルが英語であることを確認
      //    expect(await page.textContent('[data-testid="stepper"]')).toMatch(/basic|info/i)
      //    ステップ1: "Basic Info" 相当
      //    ステップ2: "Practice Log" 相当
      // 3. 日本語が含まれないことを確認
      expect(testEnv).not.toBeNull();
    },
  );

  test.fixme(
    "TC-CD-003: 予定を作成モーダルのフィールドラベル・ボタンが英語表示",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン → /en/dashboard → 予定を作成モーダルを開く
      // 2. 日付ラベル・タイトルラベル・場所ラベル・メモラベルが英語であることを確認
      // 3. 「保存して終了」相当ボタンが英語 ("Save & Close" 等) であることを確認
      // 4. 「次へ」相当ボタンが英語 ("Next" 等) であることを確認
      expect(testEnv).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// [V-CD-E03] ConfirmDialog (未保存変更) の英語表示
// ---------------------------------------------------------------------------

test.describe("ConfirmDialog (未保存変更) の英語表示", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。",
  );

  test.fixme(
    "TC-CD-004: 予定を作成モーダルでメモを入力してキャンセル → 未保存変更 ConfirmDialog が英語",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン → /en/dashboard → 予定を作成モーダルを開く
      // 2. メモフィールドに文字を入力
      // 3. 閉じるボタン (×) をクリック
      // 4. ConfirmDialog が表示されることを確認: await page.waitForSelector('[role="alertdialog"]')
      // 5. ConfirmDialog のタイトルが英語であることを確認
      //    expect(await page.textContent('[role="alertdialog"] h2')).toMatch(/unsaved|changes/i)
      // 6. ConfirmDialog のメッセージ・ボタンが英語であることを確認
      // 7. 「キャンセル」相当ボタン (入力に戻る) が英語であることを確認
      expect(testEnv).not.toBeNull();
    },
  );

  test.fixme(
    "TC-CD-005: ブラウザバック操作で ConfirmDialog (未保存変更) が英語表示",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン → /en/dashboard → 予定を作成モーダルを開く
      // 2. メモフィールドに文字を入力
      // 3. ブラウザの戻るボタンをシミュレート (popstate イベント)
      // 4. ConfirmDialog (messageBack) が英語であることを確認
      expect(testEnv).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// [V-CD-E04] 大会情報登録モーダルの英語表示 (CompetitionBasicForm)
// ---------------------------------------------------------------------------

test.describe("大会情報登録モーダルの英語表示 (CompetitionBasicForm)", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。",
  );

  test.fixme(
    "TC-CD-006: /en/dashboard で大会情報登録モーダルが英語表示",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン → /en/dashboard
      // 2. 大会登録ボタン (カレンダー上の「大会」ボタン等) をクリック
      // 3. モーダルタイトルが英語 ("Create Competition" 等) であることを確認
      // 4. 3ステップのステッパーが英語であることを確認
      //    - ステップ1: "Competition Info" 相当 (大会情報)
      //    - ステップ2: "Entry" 相当 (エントリー)
      //    - ステップ3: "Record" 相当 (記録入力)
      // 5. フィールドラベル (開始日・終了日・大会名・場所・プール種別・備考) が英語であることを確認
      // 6. ボタン (「保存して終了」「エントリーへ」相当) が英語であることを確認
      // 7. MISSING_MESSAGE エラーが 0 件であることを確認
      const getErrors = setupMissingMessageListener(page);
      void getErrors;
      expect(testEnv).not.toBeNull();
    },
  );

  test.fixme(
    "TC-CD-007: 大会情報登録モーダルの終了日バリデーションエラーが英語表示",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン → /en/dashboard → 大会情報登録モーダルを開く
      // 2. 終了日に開始日より前の日付を入力
      // 3. バリデーションエラーメッセージが英語であることを確認
      //    (end_date_error キー相当)
      expect(testEnv).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// [V-CD-E05] TagInput の英語表示
// ---------------------------------------------------------------------------

test.describe("TagInput の英語表示", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。",
  );

  test.fixme(
    "TC-CD-008: /en/dashboard で TagInput の placeholder が英語表示",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン → /en/dashboard → 予定を作成モーダルを開く (練習記録ステップへ)
      // 2. タグ入力フィールドの placeholder が英語であることを確認
      //    (forms.tag.placeholder キー相当)
      // 3. タグ検索で候補なし表示が英語であることを確認
      //    (forms.tag.noMatch キー相当)
      expect(testEnv).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// [V-CD-E06] ImageUploader の英語表示
// ---------------------------------------------------------------------------

test.describe("ImageUploader の英語表示", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。",
  );

  test.fixme(
    "TC-CD-009: /en/dashboard の予定作成モーダルで ImageUploader が英語表示",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン → /en/dashboard → 予定を作成モーダルを開く
      // 2. ImageUploader のラベルが英語であることを確認
      //    (forms.imageUploader.label 相当: "Attach Images" 等)
      // 3. ドラッグ&ドロップ領域のテキストが英語であることを確認
      //    (forms.imageUploader.clickToSelect / orDragDrop 相当)
      // 4. ファイル形式説明テキストが英語であることを確認
      //    (forms.imageUploader.formatDescription 相当)
      // 5. 枚数カウント表示が英語フォーマットであることを確認
      //    (forms.imageUploader.countDisplay 相当: "0/10")
      expect(testEnv).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// [V-CD-E07] [V-CD-E08] /ja/dashboard での日本語維持確認
// ---------------------------------------------------------------------------

test.describe("/ja/dashboard でのモーダル日本語表示維持", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。",
  );

  test.fixme(
    "TC-CD-010: /ja/dashboard で予定を作成モーダルが日本語表示のまま維持される",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン → /ja/dashboard (デフォルト)
      // 2. 予定を作成モーダルを開く
      // 3. モーダルタイトルが「予定を作成」であることを確認
      // 4. ステッパーが「基本情報」「練習記録」であることを確認
      // 5. フィールドラベル・ボタンが日本語であることを確認
      // 6. MISSING_MESSAGE エラーが 0 件であることを確認
      const getErrors = setupMissingMessageListener(page);
      void getErrors;
      expect(testEnv).not.toBeNull();
    },
  );

  test.fixme(
    "TC-CD-011: /ja/dashboard で大会情報登録モーダルが日本語表示のまま維持される",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン → /ja/dashboard
      // 2. 大会情報登録モーダルを開く
      // 3. モーダルタイトルが「大会情報登録」相当であることを確認
      // 4. ステッパーが「大会情報」「エントリー」「記録入力」であることを確認
      // 5. MISSING_MESSAGE エラーが 0 件であることを確認
      const getErrors = setupMissingMessageListener(page);
      void getErrors;
      expect(testEnv).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// [V-CD-E09] [V-CD-E10] MISSING_MESSAGE ゼロ確認
// ---------------------------------------------------------------------------

test.describe("MISSING_MESSAGE コンソールエラーゼロ確認", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。",
  );

  test.fixme(
    "TC-CD-012: /en/dashboard でダッシュボード全体の MISSING_MESSAGE が 0 件",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. MISSING_MESSAGE リスナーを設定
      // 2. ログイン → /en/dashboard
      // 3. await page.waitForLoadState("networkidle")
      // 4. 予定を作成モーダルを開く
      // 5. 大会情報登録モーダルを開く
      // 6. 各モーダルで networkidle を待つ
      // 7. getErrors() が空であることを確認
      const getErrors = setupMissingMessageListener(page);
      void getErrors;
      expect(testEnv).not.toBeNull();
    },
  );

  test.fixme(
    "TC-CD-013: /ja/dashboard でダッシュボード全体の MISSING_MESSAGE が 0 件",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. MISSING_MESSAGE リスナーを設定
      // 2. ログイン → /ja/dashboard
      // 3. await page.waitForLoadState("networkidle")
      // 4. 予定を作成モーダルを開く
      // 5. 大会情報登録モーダルを開く
      // 6. getErrors() が空であることを確認
      const getErrors = setupMissingMessageListener(page);
      void getErrors;
      expect(testEnv).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// [V-CD-E11] LanguageSwitcher 切り替え後のモーダル表示
// ---------------------------------------------------------------------------

test.describe("LanguageSwitcher 切り替え後のモーダル英語表示", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。",
  );

  test.fixme(
    "TC-CD-014: /ja/dashboard で en に切り替え後に予定を作成モーダルが英語表示",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン → /ja/dashboard
      // 2. LanguageSwitcher の "EN" ボタンをクリック
      // 3. await page.waitForURL("**/en/dashboard**")
      // 4. 予定を作成モーダルを開く
      // 5. モーダルタイトルが英語であることを確認
      // 6. ステッパー・ラベル・ボタンが英語であることを確認
      expect(testEnv).not.toBeNull();
    },
  );
});
