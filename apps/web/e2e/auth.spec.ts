import { expect, test } from '@playwright/test'

/**
 * 認証系のE2Eテスト
 * ログイン、ログアウトの基本的な機能をテスト
 * 新規登録→ログインの自然なフローでテストを実行
 */
test.describe('認証機能', () => {

  test.beforeEach(async ({ page }) => {
    // 各テスト前にログインページに移動
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
  })

  test('新規登録からログインまでの完全フロー', async ({ page }) => {
    // Step 1: 新規登録
    await expect(page).toHaveURL('/login')
    
    // アカウント作成リンクをクリック
    await page.click('text=アカウントをお持ちでない方はこちら')
    await expect(page.locator('h2').filter({ hasText: 'アカウント作成' })).toBeVisible()
    
    // 新規登録フォームに入力
    await page.fill('input[id="name"]', 'E2Eテストユーザー')
    await page.fill('input[id="email"]', 'e2e-test@swimhub.com')
    await page.fill('input[id="password"]', 'E2ETest123!')
    
    // 登録ボタンをクリック
    await page.click('button[type="submit"]')
    
    // 登録成功メッセージを確認
    await expect(page.locator('.bg-green-50, .text-green-700').filter({ hasText: /確認メール|メールを確認/ })).toBeVisible({ timeout: 5000 })
    
    // Step 2: ログインフォームに切り替え
    await page.click('text=すでにアカウントをお持ちの方はこちら')
    await expect(page.locator('h2').filter({ hasText: 'ログイン' })).toBeVisible()
    
    // Step 3: ログイン実行
    await page.fill('input[id="email"]', 'e2e-test@swimhub.com')
    await page.fill('input[id="password"]', 'E2ETest123!')
    await page.click('button[type="submit"]')
    
    // ローディング状態を待つ
    await page.waitForLoadState('networkidle')
    
    // ダッシュボードにリダイレクトされることを確認
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 })
    
    // ログイン後の要素が表示されることを確認
    await expect(page.locator('text=ダッシュボード, text=Dashboard, h1, h2').first()).toBeVisible({ timeout: 5000 })
  })

  test('無効な認証情報でのログイン試行', async ({ page }) => {
    // 無効な認証情報を入力
    await page.fill('input[id="email"]', 'invalid@example.com')
    await page.fill('input[id="password"]', 'wrongpassword')
    
    // ログインボタンをクリック
    await page.click('button[type="submit"]')
    
    // エラーメッセージが表示されることを確認（実際のエラーメッセージに合わせる）
    await expect(page.locator('.bg-red-50, .text-red-700').filter({ hasText: /メールアドレスまたはパスワードが正しくありません|ログインに失敗しました/ })).toBeVisible({ timeout: 5000 })
    
    // ログインページに留まることを確認
    await expect(page).toHaveURL('/login')
  })

  test('ログアウト機能', async ({ page }) => {
    // Step 1: 新規登録
    await page.click('text=アカウントをお持ちでない方はこちら')
    await page.fill('input[id="name"]', 'ログアウトテストユーザー')
    await page.fill('input[id="email"]', 'logout-test@swimhub.com')
    await page.fill('input[id="password"]', 'LogoutTest123!')
    await page.click('button[type="submit"]')
    
    // 登録成功を確認
    await expect(page.locator('.bg-green-50, .text-green-700').filter({ hasText: /確認メール|メールを確認/ })).toBeVisible({ timeout: 5000 })
    
    // Step 2: ログイン
    await page.click('text=すでにアカウントをお持ちの方はこちら')
      await page.fill('input[id="email"]', 'logout-test@swimhub.com')
    await page.fill('input[id="password"]', 'LogoutTest123!')
    await page.click('button[type="submit"]')
    
    // ダッシュボードに移動したことを確認
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 })
    
    // Step 3: ログアウト
    await page.locator('[data-testid="user-menu"], .user-menu, button:has-text("ログアウト"), text=ログアウト').first().click()
    
    // ログインページにリダイレクトされることを確認
    await expect(page).toHaveURL('/login', { timeout: 5000 })
    
    // ログイン状態がクリアされていることを確認
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login(\?redirect_to=.*)?/)
  })

  test('未認証状態での保護されたページアクセス', async ({ page }) => {
    // 認証が必要なページに直接アクセス
    await page.goto('/dashboard')
    
    // ログインページにリダイレクトされることを確認（redirect_toパラメータ付き）
    await expect(page).toHaveURL(/\/login(\?redirect_to=.*)?/)
  })

  test('ログイン状態の永続化', async ({ page, context }) => {
    // Step 1: 新規登録
    await page.click('text=アカウントをお持ちでない方はこちら')
    await page.fill('input[id="name"]', '永続化テストユーザー')
    await page.fill('input[id="email"]', 'persistence-test@swimhub.com')
    await page.fill('input[id="password"]', 'PersistenceTest123!')
    await page.click('button[type="submit"]')
    
    // 登録成功を確認
    await expect(page.locator('.bg-green-50, .text-green-700').filter({ hasText: /確認メール|メールを確認/ })).toBeVisible({ timeout: 5000 })
    
    // Step 2: ログイン
    await page.click('text=すでにアカウントをお持ちの方はこちら')
    await page.fill('input[id="email"]', 'persistence-test@swimhub.com')
    await page.fill('input[id="password"]', 'PersistenceTest123!')
    await page.click('button[type="submit"]')
    
    // ダッシュボードに移動
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 })
    
    // Step 3: 新しいタブでセッション確認
    const newPage = await context.newPage()
    await newPage.goto('/dashboard')
    
    // 新しいタブでもログイン状態が保持されていることを確認
    await expect(newPage).toHaveURL('/dashboard', { timeout: 5000 })
    await expect(newPage.locator('h1, h2').filter({ hasText: /ダッシュボード|Dashboard/ })).toBeVisible({ timeout: 5000 })
    
    await newPage.close()
  })

  test('パスワードリセット機能', async ({ page }) => {
    // Step 1: 新規登録（パスワードリセット対象ユーザー）
    await page.click('text=アカウントをお持ちでない方はこちら')
    await page.fill('input[id="name"]', 'リセットテストユーザー')
    await page.fill('input[id="email"]', 'reset-test@swimhub.com')
    await page.fill('input[id="password"]', 'ResetTest123!')
    await page.click('button[type="submit"]')
    
    // 登録成功を確認
    await expect(page.locator('.bg-green-50, .text-green-700').filter({ hasText: /確認メール|メールを確認/ })).toBeVisible({ timeout: 5000 })
    
    // Step 2: パスワードリセット
    await page.click('text=すでにアカウントをお持ちの方はこちら')
    await page.click('text=パスワードを忘れた方はこちら')
    
    // パスワードリセットページに移動
    await expect(page).toHaveURL('/reset-password')
    
    // メールアドレスを入力
    await page.fill('input[type="email"]', 'reset-test@swimhub.com')
    
    // リセットボタンをクリック
    await page.click('button[type="submit"]')
    
    // 成功メッセージが表示されることを確認
    await expect(page.locator('.bg-green-50, .text-green-700').filter({ hasText: /パスワードリセット|メールを送信/ })).toBeVisible({ timeout: 5000 })
  })

  test('新規ユーザー登録のみ', async ({ page }) => {
    // アカウント作成リンクをクリック
    await page.click('text=アカウントをお持ちでない方はこちら')
    
    // フォームが切り替わることを確認（h2タグのみを指定してstrict mode violation回避）
    await expect(page.locator('h2').filter({ hasText: 'アカウント作成' })).toBeVisible()
    
    // 新規登録フォームに入力
    await page.fill('input[id="name"]', '単体登録テストユーザー')
    await page.fill('input[id="email"]', 'single-register@swimhub.com')
    await page.fill('input[id="password"]', 'SingleRegister123!')
    
    // 登録ボタンをクリック
    await page.click('button[type="submit"]')
    
    // 登録成功メッセージを確認
    await expect(page.locator('.bg-green-50, .text-green-700').filter({ hasText: /確認メール|メールを確認/ })).toBeVisible({ timeout: 5000 })
  })
})
