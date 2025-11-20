import { expect, test } from '@playwright/test'
import { LoginAction } from '../actions/LoginAction'
import { SignupAction } from '../actions/SignupAction'
import { TIMEOUTS, URLS } from '../config/constants'
import { EnvConfig } from '../config/env'
import { LoginPage } from '../pages/LoginPage'
import { TestCredentialsFactory } from '../utils/test-data'

test.describe('認証機能', () => {
  test.beforeEach(async ({ page }) => {
    // 各テスト前にログインページに移動
    const env = EnvConfig.getTestEnvironment()
    const loginPage = new LoginPage(page)
    await loginPage.goto(`${env.baseUrl}${URLS.LOGIN}`)
    await loginPage.waitForReady()
  })

  test('新規登録からログインまでの完全フロー', async ({ page }) => {
    // Arrange: テスト準備
    const env = EnvConfig.getTestEnvironment()
    const signupAction = new SignupAction(page)
    const loginAction = new LoginAction(page)
    const loginPage = new LoginPage(page)
    
    const { email: testEmail, password: testPassword, name: testName } = 
      TestCredentialsFactory.forSignupLoginFlow()

    // Act: 操作実行
    // Step 1: 新規登録
    await signupAction.execute(env.baseUrl, testName, testEmail, testPassword)
    
    // 登録成功メッセージを確認
    const successMessage = await loginPage.getSuccessMessage()
    expect(successMessage).toContain('確認メール')

    // Step 2: ログインモードに切り替え
    await loginPage.switchToLoginMode()

    // Step 3: ログイン実行
    await loginAction.execute(env.baseUrl, testEmail, testPassword)

    // Assert: 結果検証
    await expect(page).toHaveURL(new RegExp(`.*${URLS.DASHBOARD}`), { timeout: TIMEOUTS.LONG })
    // ダッシュボードの見出しを確認（h1とh2の複数候補があるため.first()を使用）
    await expect(
      page.locator('h1, h2').filter({ hasText: /ダッシュボード|Dashboard/ }).first()
    ).toBeVisible({ timeout: TIMEOUTS.SHORT })
  })

  test('無効な認証情報でのログイン試行', async ({ page }) => {
    // Arrange: テスト準備
    const env = EnvConfig.getTestEnvironment()
    const loginAction = new LoginAction(page)
    const loginPage = new LoginPage(page)

    // Act: 操作実行（失敗を期待するためexpectSuccess=falseを指定）
    await loginAction.execute(env.baseUrl, 'invalid@example.com', 'wrongpassword', { expectSuccess: false })

    // Assert: 結果検証
    const errorMessage = await loginPage.getErrorMessage()
    expect(errorMessage).toContain('メールアドレスまたはパスワードが正しくありません')
    await expect(page).toHaveURL(new RegExp(`.*${URLS.LOGIN}`))
  })

  test('ログアウト機能', async ({ page }) => {
    // Arrange: テスト準備
    const env = EnvConfig.getTestEnvironment()
    const signupAction = new SignupAction(page)
    const loginAction = new LoginAction(page)
    const loginPage = new LoginPage(page)
    
    const { email: testEmail, password: testPassword, name: testName } = 
      TestCredentialsFactory.forLogoutTest()

    // Act: 操作実行
    // Step 1: 新規登録
    await signupAction.execute(env.baseUrl, testName, testEmail, testPassword)
    await loginPage.switchToLoginMode()

    // Step 2: ログイン
    await loginAction.execute(env.baseUrl, testEmail, testPassword)
    await expect(page).toHaveURL(new RegExp(`.*${URLS.DASHBOARD}`), { timeout: TIMEOUTS.DEFAULT })

    // Step 3: ログアウト
    // ログアウトボタンは複数のセレクタ候補があるため、最初の要素を使用
    // TODO: data-testid="logout-button" の追加を依頼して、より具体的なセレクタに変更
    await page.locator('[data-testid="user-menu"], .user-menu, button:has-text("ログアウト"), text=ログアウト').first().click()

    // Assert: 結果検証
    await expect(page).toHaveURL(new RegExp(`.*${URLS.LOGIN}`), { timeout: TIMEOUTS.SHORT })
    
    // ログイン状態がクリアされていることを確認
    await page.goto(`${env.baseUrl}${URLS.DASHBOARD}`)
    await expect(page).toHaveURL(new RegExp(`.*${URLS.LOGIN}`))
  })

  test('未認証状態での保護されたページアクセス', async ({ page }) => {
    // Arrange: テスト準備
    const env = EnvConfig.getTestEnvironment()

    // Act: 操作実行
    await page.goto(`${env.baseUrl}${URLS.DASHBOARD}`)

    // Assert: 結果検証
    await expect(page).toHaveURL(new RegExp(`.*${URLS.LOGIN}(\\?redirect_to=.*)?`))
  })

  test('ログイン状態の永続化', async ({ page, context }) => {
    // Arrange: テスト準備
    const env = EnvConfig.getTestEnvironment()
    const signupAction = new SignupAction(page)
    const loginAction = new LoginAction(page)
    const loginPage = new LoginPage(page)
    
    const { email: testEmail, password: testPassword, name: testName } = 
      TestCredentialsFactory.forPersistenceTest()

    // Act: 操作実行
    // Step 1: 新規登録
    await signupAction.execute(env.baseUrl, testName, testEmail, testPassword)
    await loginPage.switchToLoginMode()

    // Step 2: ログイン
    await loginAction.execute(env.baseUrl, testEmail, testPassword)
    await expect(page).toHaveURL(new RegExp(`.*${URLS.DASHBOARD}`), { timeout: TIMEOUTS.DEFAULT })

    // Step 3: 新しいタブでセッション確認
    const newPage = await context.newPage()
    await newPage.goto(`${env.baseUrl}${URLS.DASHBOARD}`)

    // Assert: 結果検証
    await expect(newPage).toHaveURL(new RegExp(`.*${URLS.DASHBOARD}`), { timeout: TIMEOUTS.SHORT })
    // ダッシュボードの見出しを確認（h1とh2の複数候補があるため.first()を使用）
    await expect(
      newPage.locator('h1, h2').filter({ hasText: /ダッシュボード|Dashboard/ }).first()
    ).toBeVisible({ timeout: TIMEOUTS.SHORT })
    
    await newPage.close()
  })

  test('パスワードリセット機能', async ({ page }) => {
    // Arrange: テスト準備
    const env = EnvConfig.getTestEnvironment()
    const signupAction = new SignupAction(page)
    const loginPage = new LoginPage(page)
    
    const { email: testEmail, password: testPassword, name: testName } = 
      TestCredentialsFactory.forPasswordResetTest()

    // Act: 操作実行
    // Step 1: 新規登録
    await signupAction.execute(env.baseUrl, testName, testEmail, testPassword)
    await loginPage.switchToLoginMode()

    // Step 2: パスワードリセット
    await loginPage.clickResetPasswordLink()

    // Assert: 結果検証
    await expect(page).toHaveURL(new RegExp(`.*/reset-password`))
    
    // メールアドレスを入力
    await page.fill('input[type="email"]', testEmail)
    await page.click('button[type="submit"]')

    // 成功メッセージが表示されることを確認
    await expect(
      page.locator('.bg-green-50, .text-green-700').filter({ hasText: /パスワードリセット|メールを送信/ })
    ).toBeVisible({ timeout: TIMEOUTS.SHORT })
  })

  test('新規ユーザー登録のみ', async ({ page }) => {
    // Arrange: テスト準備
    const env = EnvConfig.getTestEnvironment()
    const signupAction = new SignupAction(page)
    const loginPage = new LoginPage(page)
    
    const { email: testEmail, password: testPassword, name: testName } = 
      TestCredentialsFactory.forSingleRegisterTest()

    // Act: 操作実行
    await signupAction.execute(env.baseUrl, testName, testEmail, testPassword)

    // Assert: 結果検証
    const successMessage = await loginPage.getSuccessMessage()
    expect(successMessage).toContain('確認メール')
  })
})

