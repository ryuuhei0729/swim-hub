import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { memberLogin } from '../utils/login'

function formatDateInCurrentMonth(day: number): string {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth(), day)
  return target.toISOString().split('T')[0]
}

async function openAddCompetitionModal(page: Page, dateIso: string) {
  const dayCell = page
    .locator(`[data-testid="calendar-day"][data-date="${dateIso}"]`)
    .first()

  await dayCell.hover()
  await dayCell.locator('[data-testid="day-add-button"]').click()

  const addMenuModal = page.getByTestId('add-menu-modal')
  await addMenuModal.waitFor({ state: 'visible' })
  const addButton = addMenuModal.getByTestId('add-record-button')
  await addButton.focus()
  await page.keyboard.press('Enter')
  await page.getByTestId('competition-form-modal').waitFor({ state: 'visible' })
}

test.describe('個人ダッシュボード（大会・記録系）', () => {
  test.beforeEach(async ({ page }) => {
    await memberLogin(page)
  })

  test('大会記録を追加してエントリー登録経由で記録登録できる', async ({ page }) => {
    const competitionDate = formatDateInCurrentMonth(12)
    const competitionCell = page
      .locator(`[data-testid="calendar-day"][data-date="${competitionDate}"]`)
      .first()

    await openAddCompetitionModal(page, competitionDate)
    await expect(page.getByTestId('competition-date')).toHaveValue(competitionDate)

    // competitionモーダルで大会情報を登録
    await page.getByTestId('competition-title').fill('E2Eテスト記録会')
    await page.getByTestId('competition-place').fill('スイムセンター')
    await page.getByTestId('competition-pool-type').selectOption('0')
    await page.getByTestId('competition-note').fill('自動テスト')
    await page.getByRole('button', { name: '次へ（記録登録）' }).click()

    const entryModal = page.getByTestId('entry-form-modal')
    await entryModal.waitFor({ state: 'visible' })

    // entryモーダルでエントリー情報を登録
    await page.getByTestId('entry-style-1').selectOption({ index: 1 })
    await page.getByTestId('entry-time-1').fill('35.00')
    await page.getByTestId('entry-note-1').fill('E2E エントリー1')
    await page.getByTestId('entry-add-button').click()
    await page.getByTestId('entry-style-2').selectOption({ index: 2 })
    await page.getByTestId('entry-time-2').fill('1:06.50')
    await page.getByTestId('entry-note-2').fill('E2E エントリー2')
    await page.getByTestId('entry-submit-button').click()
    await entryModal.waitFor({ state: 'hidden' })

    await expect(competitionCell.locator('[data-testid="entry-mark"]')).not.toHaveCount(0)

    const recordModal = page.getByTestId('record-form-modal')
    await recordModal.waitFor({ state: 'visible' })
    await expect(page.getByTestId('record-entry-section-1')).toBeVisible()
    await expect(page.getByTestId('record-entry-section-2')).toBeVisible()

    // recordモーダルで記録情報を登録
    await page.getByTestId('record-time-1').fill('34.50')
    const recordSection1 = page.getByTestId('record-entry-section-1')
    await recordSection1.getByRole('button', { name: '追加' }).click()
    await recordSection1.getByTestId('record-split-distance-1-1').fill('25')
    await recordSection1.getByTestId('record-split-time-1-1').fill('15.00')
    await page.getByTestId('record-note-1').fill('E2E 自動登録1')
    await page.getByTestId('record-time-2').fill('1:04.50')
    await page.getByTestId('record-relay-1').check()
    const recordSection2 = page.getByTestId('record-entry-section-2')
    await recordSection2.getByRole('button', { name: '追加' }).click()
    await recordSection2.getByTestId('record-split-distance-2-1').fill('50')
    await recordSection2.getByTestId('record-split-time-2-1').fill('31.00')
    await page.getByTestId('record-note-2').fill('E2E 自動登録2')
    await page.getByTestId('save-record-button').click()
    await recordModal.waitFor({ state: 'hidden' })

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
    // 既に登録済みのデータがある日付を開く（前のテストと同じ日付を使用）
    const competitionDate = formatDateInCurrentMonth(12)
    const competitionCell = page
      .locator(`[data-testid="calendar-day"][data-date="${competitionDate}"]`)
      .first()

    // カレンダーの該当日を開き詳細モーダルを表示
    await competitionCell.click()
    const detailModal = page.getByTestId('record-detail-modal').first()
    await detailModal.waitFor({ state: 'visible' })

    // 大会情報を編集
    await detailModal.getByTestId('edit-competition-button').click()
    const competitionEditModal = page.getByTestId('competition-form-modal')
    await competitionEditModal.waitFor({ state: 'visible' })
    await expect(page.getByTestId('competition-title')).toHaveValue('E2Eテスト記録会')
    await page.getByTestId('competition-title').fill('E2Eテスト記録会（編集後）')
    await page.getByTestId('competition-place').fill('スイムセンター（編集後）')
    await page.getByTestId('competition-pool-type').selectOption('1')
    await page.getByTestId('competition-note').fill('自動テスト（編集後）')
    await page.getByRole('button', { name: '更新' }).click()
    await competitionEditModal.waitFor({ state: 'hidden' })

    // エントリー情報を編集
    // await detailModal.getByTestId('edit-entry-button').click()
    // const entryEditModal = page.getByTestId('entry-form-modal')
    // await entryEditModal.waitFor({ state: 'visible' })
    // await page.getByTestId('entry-time-1').fill('33.00')
    // await page.getByTestId('entry-note-1').fill('E2E エントリー1（編集後）')
    // await page.getByTestId('entry-submit-button').click()
    // await entryEditModal.waitFor({ state: 'hidden' })

    // 記録情報を編集
    await detailModal.getByTestId('edit-record-button').first().click()
    const recordEditModal = page.getByTestId('record-form-modal')
    await recordEditModal.waitFor({ state: 'visible' })
    await expect(page.getByTestId('record-time-1')).toHaveValue('34.50')
    await page.getByTestId('record-time-1').fill('33.50')
    await page.getByTestId('record-note-1').fill('E2E 自動登録1（編集後）')
    await page.getByTestId('update-record-button').click()
    await recordEditModal.waitFor({ state: 'hidden' })

    // 編集後、詳細モーダルが閉じられるので再度開く
    await competitionCell.click()
    const detailModalAfterRecordEdit = page.getByTestId('record-detail-modal').first()
    await detailModalAfterRecordEdit.waitFor({ state: 'visible' })

    // 詳細モーダルで編集内容を確認
    await expect(detailModalAfterRecordEdit.getByText('E2Eテスト記録会（編集後）').first()).toBeVisible()
    await expect(detailModalAfterRecordEdit.getByText('E2E 自動登録1（編集後）').first()).toBeVisible()
    await page.keyboard.press('Escape')
  })
  
})


