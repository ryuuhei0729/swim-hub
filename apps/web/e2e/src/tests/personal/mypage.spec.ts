import { expect, test } from '@playwright/test'

test.describe('マイページ', () => {
  // 注意: ログイン状態はglobal-setup.tsで保存されたstorageStateが自動的に使用されます
  // 各テストで個別にログイン処理を実行する必要はありません

  test('マイページが正常に表示される', async ({ page }) => {
    // Act: 操作実行
    await page.goto(`/mypage`)

    // Assert: 結果検証
    await expect(page).toHaveURL(new RegExp(`.*/mypage`))
    // ページが正常に読み込まれることを確認（具体的な要素は実装に応じて調整）
  })
})

