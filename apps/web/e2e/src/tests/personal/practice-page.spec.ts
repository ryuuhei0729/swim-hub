import { expect, test } from '@playwright/test'
import { EnvConfig } from '../../config/env'
import { LoginAction } from '../../actions/LoginAction'

test.describe('練習ページ', () => {
  test.beforeEach(async ({ page }) => {
    // Arrange: テスト準備
    const env = EnvConfig.getTestEnvironment()
    const loginAction = new LoginAction(page)
    
    // Act: ログイン
    await loginAction.execute(env.baseUrl, env.credentials.email, env.credentials.password)
  })

  test('練習ページが正常に表示される', async ({ page }) => {
    // Arrange: テスト準備
    const env = EnvConfig.getTestEnvironment()

    // Act: 操作実行
    await page.goto(`${env.baseUrl}/practice`)

    // Assert: 結果検証
    await expect(page).toHaveURL(new RegExp(`.*/practice`))
    // ページが正常に読み込まれることを確認（具体的な要素は実装に応じて調整）
  })
})

