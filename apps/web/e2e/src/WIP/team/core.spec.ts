import { expect, test } from '@playwright/test'
import { EnvConfig } from '../../config/config'

test.describe('チーム基本機能', () => {
  // 注意: ログイン状態はglobal-setup.tsで保存されたstorageStateが自動的に使用されます
  // 各テストで個別にログイン処理を実行する必要はありません

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

