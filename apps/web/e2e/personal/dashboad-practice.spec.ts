import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { memberLogin } from '../utils/login'

function formatDateInCurrentMonth(day: number): string {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth(), day)
  return target.toISOString().split('T')[0]
}

async function openAddPracticeModal(page: Page, dateIso: string) {
  const dayCell = page
    .locator(`[data-testid="calendar-day"][data-date="${dateIso}"]`)
    .first()

  await dayCell.hover()
  await dayCell.locator('[data-testid="day-add-button"]').click()

  const addMenuModal = page.getByTestId('add-menu-modal')
  await addMenuModal.waitFor({ state: 'visible' })
  const addButton = addMenuModal.getByTestId('add-practice-button')
  await addButton.focus()
  await page.keyboard.press('Enter')
  await page.getByTestId('practice-form-modal').waitFor({ state: 'visible' })
}

async function openPracticeDetail(page: Page, dateIso: string) {
  const dayCell = page
    .locator(`[data-testid="calendar-day"][data-date="${dateIso}"]`)
    .first()
  await dayCell.locator('[data-testid="practice-mark"]').first().click()
  await page.getByTestId('practice-detail-modal').waitFor({ state: 'visible' })
}

test.describe('個人ダッシュボード（練習系）', () => {
  test.beforeEach(async ({ page }) => {
    await memberLogin(page)
  })

  test('カレンダーが正常に表示される', async ({ page }) => {
    await expect(page.getByTestId('calendar')).toBeVisible()
  })

  test('練習を追加して練習ログを登録できる', async ({ page }) => {
    const practiceDate = formatDateInCurrentMonth(10)
    const practiceCell = page
      .locator(`[data-testid="calendar-day"][data-date="${practiceDate}"]`)
      .first()

    await openAddPracticeModal(page, practiceDate)

    await page.getByTestId('practice-date').fill(practiceDate)
    await page.getByTestId('practice-place').fill('自動テストプール')
    await page.getByTestId('practice-note').fill('E2E 練習追加')
    await page.getByTestId('save-practice-button').click()
    await page.getByTestId('practice-form-modal').waitFor({ state: 'hidden' })

    const practiceLogModal = page.getByTestId('practice-log-form-modal')
    await practiceLogModal.waitFor({ state: 'visible' })

    await expect(practiceCell.locator('[data-testid="practice-mark"]')).toHaveCount(1)

    await page.getByTestId('practice-distance').fill('200')
    await page.getByTestId('practice-rep-count').fill('4')
    await page.getByTestId('practice-set-count').fill('2')
    await page.getByTestId('practice-log-note-1').fill('E2E 練習ログ')
    await page.getByTestId('save-practice-log-button').click()
    await practiceLogModal.waitFor({ state: 'hidden' })

    await openPracticeDetail(page, practiceDate)
    await expect(page.getByTestId('practice-log-item-1')).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('カレンダーの月を切り替えて今日に戻れる', async ({ page }) => {
    const monthDisplay = page.getByTestId('month-year-display')
    const initialText = await monthDisplay.textContent()

    await page.getByTestId('next-month-button').click()
    await expect(monthDisplay).not.toHaveText(initialText ?? '')

    await page.getByTestId('today-button').click()
    await expect(monthDisplay).toHaveText(initialText ?? '')
  })
})


