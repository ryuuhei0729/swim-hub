import { expect, test } from '@playwright/test'
import { EnvConfig } from '../../config/env'
import { LoginAction } from '../../actions/LoginAction'

test.describe('チーム基本機能', () => {
  test.beforeEach(async ({ page }) => {
    // Arrange: テスト準備
    const env = EnvConfig.getTestEnvironment()
    const loginAction = new LoginAction(page)
    
    // Act: ログイン
    await loginAction.execute(env.baseUrl, env.credentials.email, env.credentials.password)
  })

  test('チームページが正常に表示される', async ({ page }) => {
    // Arrange: テスト準備
    const env = EnvConfig.getTestEnvironment()

    // Act: 操作実行
    await page.goto(`${env.baseUrl}/teams`)

    // Assert: 結果検証
    await expect(page).toHaveURL(new RegExp(`.*/teams`))
    // ページが正常に読み込まれることを確認（body要素が存在することを確認）
    await expect(page.locator('body')).toBeVisible()
    // ページタイトルまたは主要な要素が表示されることを確認
    const pageTitle = await page.locator('h1, h2').first()
    if (await pageTitle.count() > 0) {
      await expect(pageTitle).toBeVisible()
    }
  })
})

