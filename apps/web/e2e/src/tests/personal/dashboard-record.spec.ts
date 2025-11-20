import { expect, test } from '@playwright/test'
import { EnvConfig } from '../../config/env'
import { LoginAction } from '../../actions/LoginAction'
import { RecordAction } from '../../actions/RecordAction'
import { DashboardPage } from '../../pages/DashboardPage'

test.describe('個人ダッシュボード（大会・記録系）', () => {
  test.beforeEach(async ({ page }) => {
    // Arrange: テスト準備
    const env = EnvConfig.getTestEnvironment()
    const loginAction = new LoginAction(page)
    
    // Act: ログイン
    await loginAction.execute(env.baseUrl, env.credentials.email, env.credentials.password)
  })

  test('大会記録を追加してエントリー登録経由で記録登録できる', async ({ page }) => {
    // Arrange: テスト準備
    const recordAction = new RecordAction(page)
    const dashboardPage = new DashboardPage(page)
    
    const competitionDate = recordAction.formatDateInCurrentMonth(12)

    // Act: 操作実行
    await recordAction.addCompetitionWithEntryAndRecord(
      competitionDate,
      {
        title: 'E2Eテスト記録会',
        place: 'スイムセンター',
        poolType: '0',
        note: '自動テスト',
      },
      [
        {
          styleIndex: 1,
          time: '35.00',
          note: 'E2E エントリー1',
        },
        {
          styleIndex: 2,
          time: '1:06.50',
          note: 'E2E エントリー2',
        },
      ],
      [
        {
          time: '34.50',
          note: 'E2E 自動登録1',
          splitTimes: [
            {
              distance: '25',
              time: '15.00',
            },
          ],
        },
        {
          time: '1:04.50',
          note: 'E2E 自動登録2',
          isRelay: true,
          splitTimes: [
            {
              distance: '50',
              time: '31.00',
            },
          ],
        },
      ]
    )

    // Assert: 結果検証
    const competitionCell = dashboardPage.getDayCell(competitionDate)
    await expect(competitionCell.locator('[data-testid="entry-mark"]')).not.toHaveCount(0)

    // カレンダーの該当日を開き詳細モーダルで登録内容を確認
    await competitionCell.click()
    const detailModal = page.getByTestId('record-detail-modal').first()
    await detailModal.waitFor({ state: 'visible' })
    await expect(detailModal.getByText('E2Eテスト記録会').first()).toBeVisible()
    await expect(detailModal.getByText('E2E 自動登録1').first()).toBeVisible()
    await expect(detailModal.getByText('E2E 自動登録2').first()).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('大会,エントリー,記録を編集できる', async ({ page }) => {
    // Arrange: テスト準備
    const recordAction = new RecordAction(page)
    const dashboardPage = new DashboardPage(page)
    
    const competitionDate = recordAction.formatDateInCurrentMonth(12)

    // Act: 操作実行
    // 大会情報を編集
    await recordAction.editCompetition(competitionDate, {
      title: 'E2Eテスト記録会（編集後）',
      place: 'スイムセンター（編集後）',
      poolType: '1',
      note: '自動テスト（編集後）',
    })

    // 記録情報を編集
    await recordAction.editRecord(competitionDate, 1, {
      time: '33.50',
      note: 'E2E 自動登録1（編集後）',
    })

    // Assert: 結果検証
    // 編集後、詳細モーダルが閉じられるので再度開く
    const competitionCell = dashboardPage.getDayCell(competitionDate)
    await competitionCell.click()
    const detailModalAfterRecordEdit = page.getByTestId('record-detail-modal').first()
    await detailModalAfterRecordEdit.waitFor({ state: 'visible' })

    // 詳細モーダルで編集内容を確認
    await expect(detailModalAfterRecordEdit.getByText('E2Eテスト記録会（編集後）').first()).toBeVisible()
    await expect(detailModalAfterRecordEdit.getByText('E2E 自動登録1（編集後）').first()).toBeVisible()
    await page.keyboard.press('Escape')
  })
})

