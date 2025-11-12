import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createPageHelpers, TEST_USERS } from './utils/test-helpers'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const adminClient: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

let testUserId: string | null = null

async function getUserIdByEmail(email: string): Promise<string> {
  let page = 1
  const perPage = 100

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage })
    if (error) {
      throw new Error(`Failed to list users: ${error.message}`)
    }
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
    if (found) return found.id
    if (data.users.length < perPage) break
    page += 1
  }

  throw new Error(`User not found for email: ${email}`)
}

async function ensureTestUserId(): Promise<string> {
  if (!testUserId) {
    testUserId = await getUserIdByEmail(TEST_USERS.VALID_USER.email)
  }
  return testUserId
}

async function cleanupUserData(): Promise<void> {
  const userId = await ensureTestUserId()
  const tablesInOrder = [
    'team_attendance',
    'records',
    'entries',
    'competitions',
    'practice_logs',
    'practices'
  ] as const

  for (const table of tablesInOrder) {
    const { error } = await adminClient.from(table).delete().eq('user_id', userId)
    if (error && error.code !== 'PGRST116') {
      console.warn(`Failed to cleanup ${table}:`, error.message)
    }
  }
}

function formatDateInCurrentMonth(day: number): string {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth(), day)
  return target.toISOString().split('T')[0]
}

test.describe('ダッシュボード E2E', () => {
  test.beforeAll(async () => {
    await ensureTestUserId()
    await cleanupUserData()
  })

  test.beforeEach(async ({ page }) => {
    await cleanupUserData()
    const helpers = createPageHelpers(page)
    await helpers.auth.login()
  })

  test.afterEach(async () => {
    await cleanupUserData()
  })

  test('カレンダーが正常に表示される', async ({ page }) => {
    await expect(page.getByTestId('calendar')).toBeVisible()
    await expect(page.getByText('データの読み込みに失敗しました').first()).toHaveCount(0)
  })

  test('練習を追加して練習ログを登録できる', async ({ page }) => {
    const helpers = createPageHelpers(page)
    const practiceDate = formatDateInCurrentMonth(10)
    const practiceCell = page.locator(`[data-testid="calendar-day"][data-date="${practiceDate}"]`).first()

    await helpers.dashboard.openAddPracticeModal(practiceDate)
    await helpers.form.fillPracticeForm({
      date: practiceDate,
      place: '自動テストプール',
      note: 'E2E 練習追加'
    })
    await page.getByTestId('save-practice-button').click()
    await page.getByTestId('practice-form-modal').waitFor({ state: 'hidden' })

    // 練習作成後に自動でPractice_Logモーダルが開く
    const practiceLogModal = page.getByTestId('practice-log-form-modal')
    await practiceLogModal.waitFor({ state: 'visible' })

    await expect(practiceCell.locator('[data-testid="practice-mark"]')).toHaveCount(1)

    await page.getByTestId('practice-distance').fill('200')
    await page.getByTestId('practice-rep-count').fill('4')
    await page.getByTestId('practice-set-count').fill('2')
    await page.getByTestId('practice-log-note-1').fill('E2E 練習ログ')
    await page.getByTestId('save-practice-log-button').click()
    await practiceLogModal.waitFor({ state: 'hidden' })

    await helpers.dashboard.openPracticeDetail(practiceDate)
    await expect(page.getByTestId('practice-log-item-1')).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('大会記録を追加してスキップ経由で記録登録できる', async ({ page }) => {
    const helpers = createPageHelpers(page)
    const competitionDate = formatDateInCurrentMonth(12)
    const competitionCell = page.locator(`[data-testid="calendar-day"][data-date="${competitionDate}"]`).first()

    await helpers.dashboard.openAddCompetitionModal(competitionDate)
    await helpers.form.fillCompetitionForm({
      date: competitionDate,
      title: 'E2Eテスト記録会',
      place: 'スイムセンター',
      poolType: '25',
      note: '自動テスト'
    })
    await page.getByRole('button', { name: '次へ（記録登録）' }).click()

    // エントリーをスキップして記録フォームへ
    await page.getByTestId('entry-form-modal').waitFor({ state: 'visible' })
    await page.getByTestId('entry-skip-button').click()

    await page.getByTestId('record-form-modal').waitFor({ state: 'visible' })
    await page.getByTestId('record-style').selectOption({ index: 1 })
    await page.getByTestId('record-time').fill('1:02.34')
    await page.getByTestId('record-note').fill('E2E 自動登録')
    await page.getByTestId('save-record-button').click()
    await page.getByTestId('record-form-modal').waitFor({ state: 'hidden' })

    await expect(competitionCell.locator('[data-testid="competition-mark"]')).toHaveCount(1)
    await expect(competitionCell.locator('[data-testid="record-mark"]')).toHaveCount(1)
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
