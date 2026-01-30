import { expect, test, type Page } from '@playwright/test'
import { EnvConfig, URLS } from '../config/config'
import { generateTestEmail, generateTestPassword } from '../utils/test-data'

/**
 * 認証フローのE2Eテスト
 *
 * テストケース:
 * - TC-AUTH-001: ログイン成功
 * - TC-AUTH-002: ログイン失敗
 * - TC-AUTH-003: ログアウト
 * - TC-AUTH-004: 未認証アクセス制御
 * - TC-AUTH-005: サインアップ
 * - TC-AUTH-006: パスワードリセット
 */

/**
 * ログインヘルパー関数
 */
async function loginWithCredentials(page: Page, email: string, password: string) {
  await page.goto(URLS.LOGIN)
  await page.waitForLoadState('networkidle')

  await page.waitForSelector('[data-testid="email-input"]', { timeout: 10000 })
  await page.fill('[data-testid="email-input"]', email)
  await page.fill('[data-testid="password-input"]', password)
  await page.click('[data-testid="login-button"]')
}

// テスト開始前に環境変数を検証
let hasRequiredEnvVars = false
let testEnv: ReturnType<typeof EnvConfig.getTestEnvironment> | null = null
try {
  testEnv = EnvConfig.getTestEnvironment()
  hasRequiredEnvVars = true
} catch (error) {
  console.error('環境変数の検証に失敗しました:', error instanceof Error ? error.message : error)
}

test.describe('認証フローのテスト', () => {
  // 環境変数が不足している場合はテストスイートをスキップ
  test.skip(!hasRequiredEnvVars, '必要な環境変数が設定されていません。E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD を設定してください。')

  /**
   * TC-AUTH-001: ログイン成功
   * 正しい認証情報でログイン→ダッシュボードへ遷移
   */
  test('TC-AUTH-001: ログイン成功', async ({ page }) => {
    if (!testEnv) throw new Error('テスト環境が設定されていません')

    // ステップ1: ログインページに移動
    await page.goto(URLS.LOGIN)
    await page.waitForLoadState('networkidle')

    // ステップ2: ログインフォームが表示されることを確認
    await page.waitForSelector('[data-testid="email-input"]', { timeout: 10000 })
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible()

    // ステップ3: 正しい認証情報を入力
    await page.fill('[data-testid="email-input"]', testEnv.credentials.email)
    await page.fill('[data-testid="password-input"]', testEnv.credentials.password)

    // ステップ4: ログインボタンをクリック
    await page.click('[data-testid="login-button"]')

    // ステップ5: ダッシュボードのカレンダーが表示されることを確認
    await page.waitForSelector('[data-testid="calendar"]', { timeout: 15000 })
    await expect(page.locator('[data-testid="calendar"]')).toBeVisible()
  })

  /**
   * TC-AUTH-002: ログイン失敗
   * 間違ったパスワードでエラーメッセージ表示
   */
  test('TC-AUTH-002: ログイン失敗', async ({ page }) => {
    if (!testEnv) throw new Error('テスト環境が設定されていません')

    // ステップ1: ログインページに移動
    await page.goto(URLS.LOGIN)
    await page.waitForLoadState('networkidle')

    // ステップ2: 間違った認証情報を入力
    await page.waitForSelector('[data-testid="email-input"]', { timeout: 10000 })
    await page.fill('[data-testid="email-input"]', testEnv.credentials.email)
    await page.fill('[data-testid="password-input"]', 'wrong-password-123')

    // ステップ3: ログインボタンをクリック
    await page.click('[data-testid="login-button"]')

    // ステップ4: エラーメッセージが表示されることを確認
    await page.waitForSelector('.bg-red-50', { timeout: 10000 })
    const errorMessage = page.locator('.bg-red-50')
    await expect(errorMessage).toBeVisible()

    // ステップ5: ログインページに留まっていることを確認
    expect(page.url()).toContain('/login')
  })

  /**
   * TC-AUTH-003: ログアウト
   * ログアウト→ログイン画面へリダイレクト
   */
  test('TC-AUTH-003: ログアウト', async ({ page }) => {
    if (!testEnv) throw new Error('テスト環境が設定されていません')

    // 前提条件: ログイン状態にする
    await loginWithCredentials(page, testEnv.credentials.email, testEnv.credentials.password)
    await page.waitForURL('**/dashboard', { timeout: 15000 })
    await page.waitForLoadState('networkidle')

    // ステップ1: ヘッダーのユーザーメニューボタンをクリック
    // デスクトップ版のユーザーメニューボタン（rounded-fullクラスを持つボタン）を選択
    const userMenuButton = page.locator('header button.rounded-full')
    await userMenuButton.click()
    await page.waitForTimeout(500) // ドロップダウンが開くのを待つ

    // ステップ2: ログアウトボタンをクリック
    const logoutButton = page.locator('button:has-text("ログアウト"), [data-testid="logout-button"], a:has-text("ログアウト")').first()
    await logoutButton.click()
    await page.waitForURL('**/login', { timeout: 15000 })

    // ステップ2: ログインページにリダイレクトされることを確認
    expect(page.url()).toContain('/login')

    // ステップ3: ログインフォームが表示されることを確認
    await page.waitForSelector('[data-testid="email-input"]', { timeout: 10000 })
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible()
  })

  /**
   * TC-AUTH-004: 未認証アクセス制御
   * 未認証ユーザーが保護ページにアクセス→ログイン画面へリダイレクト
   */
  test('TC-AUTH-004: 未認証アクセス制御', async ({ page }) => {
    // ステップ1: ログインせずにダッシュボードに直接アクセス
    await page.goto(URLS.DASHBOARD)

    // ステップ2: ログインページにリダイレクトされることを確認
    await page.waitForURL('**/login**', { timeout: 15000 })
    expect(page.url()).toContain('/login')

    // ステップ3: 他の保護ページでも同様にリダイレクトされることを確認
    await page.goto(URLS.MYPAGE)
    await page.waitForURL('**/login**', { timeout: 15000 })
    expect(page.url()).toContain('/login')
  })

  /**
   * TC-AUTH-005: サインアップ
   * 新規ユーザー登録フロー
   */
  test('TC-AUTH-005: サインアップ', async ({ page }) => {
    // ステップ1: サインアップページに移動
    await page.goto(URLS.SIGNUP)
    await page.waitForLoadState('networkidle')

    // ステップ2: サインアップフォームが表示されることを確認
    await page.waitForSelector('[data-testid="email-input"]', { timeout: 10000 })
    await expect(page.locator('[data-testid="signup-name-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible()
    await expect(page.locator('[data-testid="signup-button"]')).toBeVisible()

    // ステップ3: 新規ユーザー情報を入力
    const testEmail = generateTestEmail('e2e-signup')
    const testPassword = generateTestPassword('E2ESignup')

    await page.fill('[data-testid="signup-name-input"]', 'E2Eテストユーザー')
    await page.fill('[data-testid="email-input"]', testEmail)
    await page.fill('[data-testid="password-input"]', testPassword)

    // ステップ4: サインアップボタンをクリック
    await page.click('[data-testid="signup-button"]')

    // ステップ5: ダッシュボードのカレンダーが表示されることを確認
    await page.waitForSelector('[data-testid="calendar"]', { timeout: 15000 })
    await expect(page.locator('[data-testid="calendar"]')).toBeVisible()
  })

  /**
   * TC-AUTH-006: パスワードリセット
   * パスワードリセットメール送信フロー
   */
  test('TC-AUTH-006: パスワードリセット', async ({ page }) => {
    if (!testEnv) throw new Error('テスト環境が設定されていません')

    // ステップ1: ログインページに移動
    await page.goto(URLS.LOGIN)
    await page.waitForLoadState('networkidle')

    // ステップ2: パスワードリセットリンクをクリック
    const resetLink = page.locator('a:has-text("パスワードを忘れた")')
    await resetLink.waitFor({ state: 'visible', timeout: 10000 })
    await resetLink.click()

    // ステップ3: パスワードリセットページに遷移することを確認
    await page.waitForURL('**/reset-password**', { timeout: 10000 })
    expect(page.url()).toContain('/reset-password')

    // ステップ4: メールアドレス入力フォームが表示されることを確認
    const emailInput = page.locator('input[type="email"], [data-testid="reset-email-input"]').first()
    await emailInput.waitFor({ state: 'visible', timeout: 10000 })
    await expect(emailInput).toBeVisible()

    // ステップ5: メールアドレスを入力してリセットメールを送信
    await emailInput.fill(testEnv.credentials.email)

    const submitButton = page.locator('button[type="submit"], [data-testid="reset-submit-button"]').first()
    await submitButton.click()

    // ステップ6: 送信成功メッセージが表示されることを確認
    const successMessage = page.locator('.bg-green-100')
    await successMessage.waitFor({ state: 'visible', timeout: 10000 })
    await expect(successMessage).toContainText('パスワードリセット用のメールを送信しました')
  })

  /**
   * TC-AUTH-007: ログインモード切り替え
   * ログイン↔サインアップモードの切り替え
   */
  test('TC-AUTH-007: ログインモード切り替え', async ({ page }) => {
    // ステップ1: ログインページに移動
    await page.goto(URLS.LOGIN)
    await page.waitForLoadState('networkidle')

    // ステップ2: ログインフォームが表示されることを確認
    await page.waitForSelector('[data-testid="login-button"]', { timeout: 10000 })
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible()

    // ステップ3: モード切り替えボタンをクリック
    const toggleButton = page.locator('[data-testid="toggle-auth-mode-button"]')
    await toggleButton.click()

    // ステップ4: サインアップフォームに切り替わることを確認
    await expect(page.locator('[data-testid="signup-button"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="signup-name-input"]')).toBeVisible()

    // ステップ5: 再度モード切り替えボタンをクリック
    await toggleButton.click()

    // ステップ6: ログインフォームに戻ることを確認
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible({ timeout: 5000 })
  })
})
