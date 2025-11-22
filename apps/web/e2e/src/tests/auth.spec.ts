import { expect, test } from '@playwright/test'
import { LoginAction } from '../actions/LoginAction'
import { LogoutAction } from '../actions/LogoutAction'
import { ResetPasswordAction } from '../actions/ResetPasswordAction'
import { SignupAction } from '../actions/SignupAction'
import { TIMEOUTS, URLS } from '../config/config'
import { DashboardPage } from '../pages/DashboardPage'
import { LoginPage } from '../pages/LoginPage'
import { ResetPasswordPage } from '../pages/ResetPasswordPage'
import { TestCredentialsFactory } from '../utils/test-data'

test.describe('認証機能', () => {
  test.beforeEach(async ({ page }) => {
    // 各テスト前にログインページに明示的に遷移
    // プロジェクト間の切り替え時にブラウザがabout:blankになるため、常に遷移する
    await page.goto(URLS.LOGIN, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('email-input').waitFor({ state: 'visible' })
  })

  test('新規登録からログインまでの完全フロー', async ({ page }) => {
    // Arrange: テスト準備
    const signupAction = new SignupAction(page)
    const dashboardPage = new DashboardPage(page)
    
    const { email: testEmail, password: testPassword, name: testName } = 
      TestCredentialsFactory.forSignupLoginFlow()

    // Act: 操作実行
    // Step 1: 新規登録
    await signupAction.execute(testName, testEmail, testPassword)
    
    // ローカルSupabase環境ではメール確認なしで即座にログインされるため
    // サインアップ後、直接ダッシュボードにリダイレクトされる

    // Assert: 結果検証
    await expect(page).toHaveURL(new RegExp(`.*${URLS.DASHBOARD}`), { timeout: TIMEOUTS.LONG })
    // カレンダーが表示されていることを確認（ダッシュボードの見出しは存在しないため）
    await expect(dashboardPage.calendar).toBeVisible({ timeout: TIMEOUTS.SHORT })
  })

  test('無効な認証情報でのログイン試行', async ({ page }) => {
    // Arrange: テスト準備
    const loginAction = new LoginAction(page)
    const loginPage = new LoginPage(page)

    // Act: 操作実行（失敗を期待するためexpectSuccess=falseを指定）
    await loginAction.execute('invalid@example.com', 'wrongpassword', { expectSuccess: false })

    // Assert: 結果検証
    const errorMessage = await loginPage.getErrorMessage()
    expect(errorMessage).toContain('メールアドレスまたはパスワードが正しくありません')
    await expect(page).toHaveURL(new RegExp(`.*${URLS.LOGIN}`))
  })

  test('ログアウト機能', async ({ page }) => {
    // Arrange: テスト準備
    const signupAction = new SignupAction(page)
    const loginAction = new LoginAction(page)
    const logoutAction = new LogoutAction(page)
    const loginPage = new LoginPage(page)
    
    const { email: testEmail, password: testPassword, name: testName } = 
      TestCredentialsFactory.forLogoutTest()

    // Act: 操作実行
    // Step 1: 新規登録（ローカルSupabase環境では即座にログインされるため、ダッシュボードにリダイレクト）
    await signupAction.execute(testName, testEmail, testPassword)
    
    // Step 2: ログアウトしてログインページに戻る
    await logoutAction.execute()
    await expect(page).toHaveURL(new RegExp(`.*${URLS.LOGIN}`), { timeout: TIMEOUTS.SHORT })
    await loginPage.waitForReady()

    // Step 3: ログイン
    await loginAction.execute(testEmail, testPassword)
    await expect(page).toHaveURL(new RegExp(`.*${URLS.DASHBOARD}`), { timeout: TIMEOUTS.DEFAULT })

    // Step 4: ログアウト
    await logoutAction.execute()

    // Assert: 結果検証
    await expect(page).toHaveURL(new RegExp(`.*${URLS.LOGIN}`), { timeout: TIMEOUTS.DEFAULT })
    
    // ログイン状態がクリアされていることを確認
    // ダッシュボードにアクセスして、middlewareでログインページにリダイレクトされることを確認
    await page.goto(URLS.DASHBOARD)
    await expect(page).toHaveURL(new RegExp(`.*${URLS.LOGIN}(\\?redirect_to=.*)?`), { timeout: TIMEOUTS.DEFAULT })
  })

  test('未認証状態での保護されたページアクセス', async ({ page }) => {
    // Act: 操作実行
    await page.goto(URLS.DASHBOARD)

    // Assert: 結果検証
    // middlewareでログインページにリダイレクトされることを確認
    await expect(page).toHaveURL(new RegExp(`.*${URLS.LOGIN}(\\?redirect_to=.*)?`), { timeout: TIMEOUTS.DEFAULT })
  })

  test('ログイン状態の永続化', async ({ page, context }) => {
    // Arrange: テスト準備
    const signupAction = new SignupAction(page)
    const logoutAction = new LogoutAction(page)
    const loginAction = new LoginAction(page)
    const loginPage = new LoginPage(page)
    
    const { email: testEmail, password: testPassword, name: testName } = 
      TestCredentialsFactory.forPersistenceTest()

    // Act: 操作実行
    // Step 1: 新規登録（ローカルSupabase環境では即座にログインされるため、ダッシュボードにリダイレクト）
    await signupAction.execute(testName, testEmail, testPassword)
    
    // Step 2: ログアウトしてログインページに戻る
    await logoutAction.execute()
    await expect(page).toHaveURL(new RegExp(`.*${URLS.LOGIN}`), { timeout: TIMEOUTS.SHORT })
    await loginPage.waitForReady()

    // Step 3: ログイン
    await loginAction.execute(testEmail, testPassword)
    await expect(page).toHaveURL(new RegExp(`.*${URLS.DASHBOARD}`), { timeout: TIMEOUTS.DEFAULT })

    // Step 4: 新しいタブでセッション確認
    const newPage = await context.newPage()
    const newDashboardPage = new DashboardPage(newPage)
    await newPage.goto(URLS.DASHBOARD)

    // Assert: 結果検証
    await expect(newPage).toHaveURL(new RegExp(`.*${URLS.DASHBOARD}`), { timeout: TIMEOUTS.SHORT })
    // カレンダーが表示されていることを確認（ダッシュボードの見出しは存在しないため）
    await expect(newDashboardPage.calendar).toBeVisible({ timeout: TIMEOUTS.SHORT })
    
    await newPage.close()
  })

  test('パスワードリセット機能', async ({ page }) => {
    // Arrange: テスト準備
    const signupAction = new SignupAction(page)
    const logoutAction = new LogoutAction(page)
    const resetPasswordAction = new ResetPasswordAction(page)
    const resetPasswordPage = new ResetPasswordPage(page)
    const loginPage = new LoginPage(page)
    
    const { email: testEmail, password: testPassword, name: testName } = 
      TestCredentialsFactory.forPasswordResetTest()

    // Act: 操作実行
    // Step 1: 新規登録（ローカルSupabase環境では即座にログインされるため、ダッシュボードにリダイレクト）
    await signupAction.execute(testName, testEmail, testPassword)
    
    // Step 2: ログアウトしてログインページに戻る
    await logoutAction.execute()
    await expect(page).toHaveURL(new RegExp(`.*${URLS.LOGIN}`), { timeout: TIMEOUTS.SHORT })
    await loginPage.waitForReady()

    // Step 3: パスワードリセット
    await resetPasswordAction.execute(testEmail)

    // Assert: 結果検証
    // 成功メッセージが表示されることを確認
    const successMessage = await resetPasswordPage.getSuccessMessage()
    expect(successMessage).toMatch(/パスワードリセット|メールを送信/)
  })
})

