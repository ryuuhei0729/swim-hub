/**
 * Phase 1-C-2-C-2: teams-admin 管理者専用画面 i18n E2E テスト
 *
 * Sprint Contract 検証観点:
 *   [V-C2C2-E01] /ja/teams-admin でページタイトルが日本語、MISSING_MESSAGE なし
 *   [V-C2C2-E02] /en/teams-admin でページタイトルが英語、MISSING_MESSAGE なし
 *   [V-C2C2-E03] LanguageSwitcher で ja ↔ en 切り替え → URL と UI が同期して変わる
 *   [V-C2C2-E04] /ja/teams-admin/[teamId] でタブ名 (出欠/お知らせ/…) が日本語
 *   [V-C2C2-E05] /en/teams-admin/[teamId] でタブ名が英語
 *   [V-C2C2-E06] /ja/teams-admin/[teamId]?tab=announcements でお知らせ管理 UI が日本語
 *   [V-C2C2-E07] /en/teams-admin/[teamId]?tab=announcements でお知らせ管理 UI が英語
 *   [V-C2C2-E08] /ja/teams-admin/[teamId]?tab=members でメンバー管理 UI が日本語
 *   [V-C2C2-E09] /ja/teams-admin/[teamId]?tab=groups でグループ管理 UI が日本語
 *   [V-C2C2-E10] /ja/teams-admin/[teamId]?tab=settings で設定 UI が日本語
 *   [V-C2C2-E11] /ja/teams-admin/[teamId]?tab=bulk-register で一括登録 UI が日本語
 *   [V-C2C2-E12] /ja/teams-admin/[teamId]?tab=attendance で出欠管理 UI が日本語
 *   [V-C2C2-E13] 管理者専用ページに非管理者でアクセスすると権限なしメッセージが表示される
 *   [V-C2C2-E14] MISSING_MESSAGE が teams-admin ページのどこにも出ない (全タブ)
 *   [V-C2C2-E15] /ja/ → /en/ 切り替え後に teams-admin の URL が /en/ プレフィックスになる
 *
 * 実装方針:
 *   - dev server が http://localhost:3000 で起動済みであること
 *   - テスト用管理者アカウントでログインして検証
 *   - MISSING_MESSAGE コンソールエラーが 0 件であることを各テストで確認
 *
 * NOTE (Phase A スケルトン):
 *   - 各テストの中身は it.todo() / test.fixme() としておく
 *   - Phase B (実装完了後) に QA が実際の操作手順を実装する
 *   - ログイン処理は既存の supabase-login ヘルパーを利用する
 *
 * ブラウザ操作: Playwright MCP
 * 前提: dev server が http://localhost:3000 で起動済み
 * 関連ファイル:
 *   - e2e/src/utils/supabase-login.ts (認証ヘルパー)
 *   - e2e/src/config/config.ts (環境変数)
 */

import { expect, test } from "@playwright/test";
import { EnvConfig } from "../config/config";

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

/**
 * MISSING_MESSAGE コンソールエラーを収集するリスナーを設定する
 */
function setupMissingMessageListener(
  page: import("@playwright/test").Page,
): () => string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().includes("MISSING_MESSAGE")) {
      errors.push(msg.text());
    }
  });
  return () => errors;
}

// ---------------------------------------------------------------------------
// [V-C2C2-E01] [V-C2C2-E02] teams-admin 一覧ページのロケール別 UI
// ---------------------------------------------------------------------------

test.describe("teams-admin 一覧ページのロケール別 UI", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD を設定してください。",
  );

  test.fixme(
    "TC-C2C2-001: /ja/teams-admin でページタイトルが日本語、MISSING_MESSAGE なし",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン (管理者アカウント)
      // 2. await page.goto("/ja/teams-admin")
      // 3. await page.waitForLoadState("networkidle")
      // 4. expect(await page.getAttribute("html", "lang")).toBe("ja")
      // 5. ページタイトル「チーム管理」が h1 に存在することを確認
      // 6. MISSING_MESSAGE エラー が 0 件であることを確認
      const getErrors = setupMissingMessageListener(page);
      void getErrors;
      expect(testEnv).not.toBeNull();
    },
  );

  test.fixme(
    "TC-C2C2-002: /en/teams-admin でページタイトルが英語、MISSING_MESSAGE なし",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン (管理者アカウント)
      // 2. await page.goto("/en/teams-admin")
      // 3. await page.waitForLoadState("networkidle")
      // 4. expect(await page.getAttribute("html", "lang")).toBe("en")
      // 5. ページタイトルが英語の文字列 ("Team Management" 等) であることを確認
      // 6. MISSING_MESSAGE エラー が 0 件であることを確認
      const getErrors = setupMissingMessageListener(page);
      void getErrors;
      expect(testEnv).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// [V-C2C2-E03] LanguageSwitcher による locale 切り替え
// ---------------------------------------------------------------------------

test.describe("teams-admin LanguageSwitcher による locale 切り替え", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。",
  );

  test.fixme(
    "TC-C2C2-003: /ja/teams-admin で en クリック → URL が /en/teams-admin に変化しタイトルが英語になる",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン (管理者アカウント)
      // 2. await page.goto("/ja/teams-admin")
      // 3. LanguageSwitcher の "EN" ボタンをクリック
      // 4. await page.waitForURL("**/en/teams-admin**")
      // 5. expect(await page.getAttribute("html", "lang")).toBe("en")
      // 6. ページタイトルが英語になっていることを確認
      expect(testEnv).not.toBeNull();
    },
  );

  test.fixme(
    "TC-C2C2-004: /en/teams-admin で ja クリック → URL が /ja/teams-admin に変化しタイトルが日本語になる",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン (管理者アカウント)
      // 2. await page.goto("/en/teams-admin")
      // 3. LanguageSwitcher の "JA" ボタンをクリック
      // 4. await page.waitForURL("**/ja/teams-admin**")
      // 5. expect(await page.getAttribute("html", "lang")).toBe("ja")
      // 6. ページタイトルが日本語になっていることを確認
      expect(testEnv).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// [V-C2C2-E04] [V-C2C2-E05] TeamAdminTabs のタブ名
// ---------------------------------------------------------------------------

test.describe("TeamAdminTabs タブ名のロケール別表示", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。",
  );

  test.fixme(
    "TC-C2C2-005: /ja/teams-admin/[teamId] でタブ名 (出欠/お知らせ/メンバー/グループ/練習/大会/一括登録/設定) が日本語",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン (管理者アカウント)
      // 2. 管理者チームの teamId を取得または設定
      // 3. await page.goto(`/ja/teams-admin/${teamId}`)
      // 4. await page.waitForLoadState("networkidle")
      // 5. タブナビゲーション内に「出欠」「お知らせ」「メンバー」「グループ」
      //    「練習」「大会」「一括登録」「設定」が含まれることを確認
      // 6. MISSING_MESSAGE エラー が 0 件であることを確認
      expect(testEnv).not.toBeNull();
    },
  );

  test.fixme(
    "TC-C2C2-006: /en/teams-admin/[teamId] でタブ名が英語 (Attendance/Announcements/Members/Groups/Practices/Competitions/Bulk Register/Settings 等)",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン (管理者アカウント)
      // 2. await page.goto(`/en/teams-admin/${teamId}`)
      // 3. await page.waitForLoadState("networkidle")
      // 4. タブナビゲーション内に英語名が含まれることを確認
      // 5. 日本語が含まれないことを確認
      expect(testEnv).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// [V-C2C2-E06] [V-C2C2-E07] お知らせ管理タブの UI
// ---------------------------------------------------------------------------

test.describe("お知らせ管理タブのロケール別 UI", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。",
  );

  test.fixme(
    "TC-C2C2-007: /ja/teams-admin/[teamId]?tab=announcements でお知らせ管理 UI が日本語",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン (管理者アカウント)
      // 2. await page.goto(`/ja/teams-admin/${teamId}?tab=announcements`)
      // 3. await page.waitForLoadState("networkidle")
      // 4. 「お知らせ」ヘッダーが表示されることを確認
      // 5. 「新規作成」ボタンが日本語であることを確認
      // 6. MISSING_MESSAGE が 0 件であることを確認
      expect(testEnv).not.toBeNull();
    },
  );

  test.fixme(
    "TC-C2C2-008: /en/teams-admin/[teamId]?tab=announcements でお知らせ管理 UI が英語",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン (管理者アカウント)
      // 2. await page.goto(`/en/teams-admin/${teamId}?tab=announcements`)
      // 3. await page.waitForLoadState("networkidle")
      // 4. ヘッダーが英語であることを確認
      // 5. 「New」「Create」等のボタンラベルが英語であることを確認
      expect(testEnv).not.toBeNull();
    },
  );

  test.fixme(
    "TC-C2C2-009: お知らせ新規作成モーダルを開くと AnnouncementForm のラベルが日本語",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン (管理者アカウント)
      // 2. /ja/teams-admin/[teamId]?tab=announcements に遷移
      // 3. 「新規作成」ボタンをクリック
      // 4. モーダルタイトル「新しいお知らせ」を確認
      // 5. タイトルラベル / 内容ラベル / 開始日時ラベル / 終了日時ラベルが日本語であることを確認
      // 6. ボタン「下書きとして保存」「キャンセル」「公開して作成」が日本語であることを確認
      // 7. MISSING_MESSAGE が 0 件であることを確認
      expect(testEnv).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// [V-C2C2-E09] グループ管理タブの UI
// ---------------------------------------------------------------------------

test.describe("グループ管理タブのロケール別 UI", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。",
  );

  test.fixme(
    "TC-C2C2-010: /ja/teams-admin/[teamId]?tab=groups でグループ管理 UI が日本語",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン (管理者アカウント)
      // 2. await page.goto(`/ja/teams-admin/${teamId}?tab=groups`)
      // 3. await page.waitForLoadState("networkidle")
      // 4. ヘッダー「グループ管理」が表示されることを確認
      // 5. 「グループを追加」ボタンが日本語であることを確認
      // 6. グループが 0 件の場合は空状態テキストが日本語であることを確認
      // 7. MISSING_MESSAGE が 0 件であることを確認
      expect(testEnv).not.toBeNull();
    },
  );

  test.fixme(
    "TC-C2C2-011: グループ追加モーダルを開くと GroupFormModal のラベルが日本語",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン (管理者アカウント)
      // 2. /ja/teams-admin/[teamId]?tab=groups に遷移
      // 3. 「グループを追加」ボタンをクリック
      // 4. モーダルタイトル「グループを追加」を確認
      // 5. カテゴリラベル / グループ名ラベルが日本語であることを確認
      // 6. 「キャンセル」「作成」ボタンが日本語であることを確認
      expect(testEnv).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// [V-C2C2-E10] 設定タブの UI
// ---------------------------------------------------------------------------

test.describe("設定タブのロケール別 UI", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。",
  );

  test.fixme(
    "TC-C2C2-012: /ja/teams-admin/[teamId]?tab=settings で TeamSettings UI が日本語",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン (管理者アカウント)
      // 2. await page.goto(`/ja/teams-admin/${teamId}?tab=settings`)
      // 3. await page.waitForLoadState("networkidle")
      // 4. 「チーム設定」タイトルが表示されることを確認
      // 5. 「チーム名」「説明」ラベルが日本語であることを確認
      // 6. 「編集」ボタンが日本語であることを確認
      // 7. MISSING_MESSAGE が 0 件であることを確認
      expect(testEnv).not.toBeNull();
    },
  );

  test.fixme(
    "TC-C2C2-013: /en/teams-admin/[teamId]?tab=settings で TeamSettings UI が英語",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン (管理者アカウント)
      // 2. await page.goto(`/en/teams-admin/${teamId}?tab=settings`)
      // 3. await page.waitForLoadState("networkidle")
      // 4. ページ上に日本語が含まれないことを確認
      // 5. 「Edit」等の英語ボタンが存在することを確認
      expect(testEnv).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// [V-C2C2-E11] 一括登録タブの UI
// ---------------------------------------------------------------------------

test.describe("一括登録タブのロケール別 UI", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。",
  );

  test.fixme(
    "TC-C2C2-014: /ja/teams-admin/[teamId]?tab=bulk-register で一括登録 UI が日本語",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン (管理者アカウント)
      // 2. await page.goto(`/ja/teams-admin/${teamId}?tab=bulk-register`)
      // 3. await page.waitForLoadState("networkidle")
      // 4. 「Excelテンプレートのダウンロード」が日本語であることを確認
      // 5. 「練習一括登録」「大会一括登録」が日本語であることを確認
      // 6. 「ファイルをインポート」が日本語であることを確認
      // 7. MISSING_MESSAGE が 0 件であることを確認
      expect(testEnv).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// [V-C2C2-E12] 出欠管理タブの UI
// ---------------------------------------------------------------------------

test.describe("出欠管理タブのロケール別 UI", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。",
  );

  test.fixme(
    "TC-C2C2-015: /ja/teams-admin/[teamId]?tab=attendance で AdminMonthlyAttendance UI が日本語",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン (管理者アカウント)
      // 2. await page.goto(`/ja/teams-admin/${teamId}?tab=attendance`)
      // 3. await page.waitForLoadState("networkidle")
      // 4. ローディング中は「読み込み中...」が日本語であることを確認
      // 5. 「まとめて出欠状態を変更」ボタンが日本語であることを確認
      //    (イベントが 0 件の場合は空状態テキストが日本語であることを確認)
      // 6. MISSING_MESSAGE が 0 件であることを確認
      expect(testEnv).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// [V-C2C2-E13] 権限なし表示の確認
// ---------------------------------------------------------------------------

test.describe("権限なしユーザーへのアクセス制御 UI", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。",
  );

  test.fixme(
    "TC-C2C2-016: 非管理者ユーザーが /ja/teams-admin/[teamId] にアクセスすると「アクセス権限がありません」が日本語で表示される",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. 非管理者 (一般メンバー) アカウントでログイン
      // 2. await page.goto(`/ja/teams-admin/${teamId}`)
      // 3. await page.waitForLoadState("networkidle")
      // 4. 権限なしメッセージが日本語で表示されることを確認
      // 5. MISSING_MESSAGE が 0 件であることを確認
      expect(testEnv).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// [V-C2C2-E14] MISSING_MESSAGE が teams-admin の全タブで出ないこと
// ---------------------------------------------------------------------------

test.describe("MISSING_MESSAGE 全体チェック (teams-admin 全タブ)", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。",
  );

  const TABS = [
    "attendance",
    "announcements",
    "members",
    "groups",
    "practices",
    "competitions",
    "bulk-register",
    "settings",
  ] as const;

  for (const tab of TABS) {
    test.fixme(
      `TC-C2C2-017-${tab}: /ja/teams-admin/[teamId]?tab=${tab} で MISSING_MESSAGE が 0 件`,
      async ({ page }) => {
        // TODO (Phase B): 実装手順
        // 1. ログイン (管理者アカウント)
        // 2. const getErrors = setupMissingMessageListener(page)
        // 3. await page.goto(`/ja/teams-admin/${teamId}?tab=${tab}`)
        // 4. await page.waitForLoadState("networkidle")
        // 5. expect(getErrors()).toHaveLength(0)
        const getErrors = setupMissingMessageListener(page);
        void getErrors;
        expect(testEnv).not.toBeNull();
      },
    );
  }
});

// ---------------------------------------------------------------------------
// [V-C2C2-E15] locale 切り替え後の URL プレフィックス確認
// ---------------------------------------------------------------------------

test.describe("locale 切り替え後の URL プレフィックス確認", () => {
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。",
  );

  test.fixme(
    "TC-C2C2-018: /ja/teams-admin から LanguageSwitcher で en に切り替えると URL が /en/teams-admin に変わる",
    async ({ page }) => {
      // TODO (Phase B): 実装手順
      // 1. ログイン (管理者アカウント)
      // 2. await page.goto("/ja/teams-admin")
      // 3. await page.waitForLoadState("networkidle")
      // 4. LanguageSwitcher の EN ボタンをクリック
      // 5. await page.waitForURL("**/en/teams-admin**")
      // 6. expect(page.url()).toContain("/en/teams-admin")
      // 7. expect(await page.getAttribute("html", "lang")).toBe("en")
      expect(testEnv).not.toBeNull();
    },
  );
});
