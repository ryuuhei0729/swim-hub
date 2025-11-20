import { expect, test } from '@playwright/test'
import { EnvConfig } from '../../config/env'
import { LoginAction } from '../../actions/LoginAction'
import { PracticeAction } from '../../actions/PracticeAction'
import { DashboardPage } from '../../pages/DashboardPage'

test.describe('個人ダッシュボード（練習系）', () => {
  test.beforeEach(async ({ page }) => {
    // Arrange: テスト準備
    const env = EnvConfig.getTestEnvironment()
    const loginAction = new LoginAction(page)
    
    // Act: ログイン
    await loginAction.execute(env.baseUrl, env.credentials.email, env.credentials.password)
  })

  test('カレンダーが正常に表示される', async ({ page }) => {
    // Arrange: テスト準備
    const dashboardPage = new DashboardPage(page)

    // Assert: 結果検証
    await expect(dashboardPage.calendar).toBeVisible()
  })

  test('練習を追加して練習ログを登録できる', async ({ page }) => {
    // Arrange: テスト準備
    const practiceAction = new PracticeAction(page)
    const dashboardPage = new DashboardPage(page)
    
    const practiceDate = practiceAction.formatDateInCurrentMonth(10)

    // Act: 操作実行
    await practiceAction.addPracticeWithLog(
      practiceDate,
      {
        place: '自動テストプール',
        note: 'E2E 練習追加',
      },
      {
        distance: '200',
        repCount: '4',
        setCount: '2',
        note: 'E2E 練習ログ',
      }
    )

    // Assert: 結果検証
    const practiceCell = dashboardPage.getDayCell(practiceDate)
    await expect(practiceCell.locator('[data-testid="practice-mark"]')).toHaveCount(1)

    // 練習詳細を開いて確認
    await practiceAction.openPracticeDetail(practiceDate)
    await expect(page.getByTestId('practice-log-item-1')).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('カレンダーの月を切り替えて今日に戻れる', async ({ page }) => {
    // Arrange: テスト準備
    const dashboardPage = new DashboardPage(page)
    const initialText = await dashboardPage.getMonthYearText()

    // Act: 操作実行
    await dashboardPage.clickNextMonth()
    await expect(dashboardPage.monthYearDisplay).not.toHaveText(initialText)

    await dashboardPage.clickToday()
    
    // Assert: 結果検証
    await expect(dashboardPage.monthYearDisplay).toHaveText(initialText)
  })
})

