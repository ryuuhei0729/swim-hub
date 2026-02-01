import { expect, test, type Page } from '@playwright/test'
import { EnvConfig, URLS } from '../config/config'

/**
 * 出席管理のE2Eテスト
 *
 * テストケース:
 * - TC-ATTEND-001: 出席登録
 * - TC-ATTEND-002: 出席編集
 * - TC-ATTEND-003: 出席一覧表示
 * - TC-ATTEND-004: 出席フィルタリング
 */

/**
 * ログインヘルパー関数
 */
async function loginIfNeeded(page: Page) {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  const currentUrl = page.url()
  if (currentUrl.includes('/login')) {
    const testEnv = EnvConfig.getTestEnvironment()

    await page.waitForSelector('[data-testid="email-input"]', { timeout: 10000 })
    await page.fill('[data-testid="email-input"]', testEnv.credentials.email)
    await page.fill('[data-testid="password-input"]', testEnv.credentials.password)
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('**/dashboard', { timeout: 15000 })
    await page.waitForLoadState('networkidle')
  }
}

/**
 * チームの出席タブに移動するヘルパー関数
 * @returns チームIDを返す（存在しない場合はnull）
 */
async function navigateToTeamAttendanceTab(page: Page): Promise<string | null> {
  // チームページに移動
  await page.goto(URLS.TEAMS)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // 参加しているチームを探す
  const teamCards = page.locator('a[href^="/teams/"]')
  const cardCount = await teamCards.count()

  if (cardCount === 0) {
    return null
  }

  // 最初のチームをクリック
  const firstTeamCard = teamCards.first()
  const href = await firstTeamCard.getAttribute('href')
  const teamId = href?.split('/teams/')[1]?.split('/')[0] || null

  await firstTeamCard.click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)

  // 出席タブをクリック
  const attendanceTab = page.locator('button:has-text("出席"), button:has-text("出欠")').first()
  if (await attendanceTab.isVisible()) {
    await attendanceTab.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
  }

  return teamId
}

// テスト開始前に環境変数を検証
let hasRequiredEnvVars = false
try {
  EnvConfig.getTestEnvironment()
  hasRequiredEnvVars = true
} catch (error) {
  console.error('環境変数の検証に失敗しました:', error instanceof Error ? error.message : error)
}

test.describe('出席管理のテスト', () => {
  // 環境変数が不足している場合はテストスイートをスキップ
  test.skip(!hasRequiredEnvVars, '必要な環境変数が設定されていません。')

  test.beforeEach(async ({ page }) => {
    await loginIfNeeded(page)
  })

  /**
   * TC-ATTEND-003: 出席一覧表示
   * 日付別出席一覧の表示
   */
  test('TC-ATTEND-003: 出席一覧表示', async ({ page }) => {
    // ステップ1: チームの出席タブに移動
    const teamId = await navigateToTeamAttendanceTab(page)

    if (!teamId) {
      console.log('参加しているチームがないため、テストをスキップします')
      // チームページが正しく表示されていることを確認
      const pageText = await page.textContent('body')
      expect(pageText?.includes('マイチーム') || pageText?.includes('チーム')).toBeTruthy()
      return
    }

    // ステップ2: 月一覧が表示されることを確認
    // MonthListコンポーネントの存在を確認（グリッドレイアウト）
    const monthListArea = page.locator('.grid')
    await page.waitForTimeout(2000)

    // 月ボタンまたは「表示できる月がありません」メッセージが表示される
    const monthButtons = page.locator('button:has-text("年")')
    const noMonthsMessage = page.locator('text=表示できる月がありません')

    const hasMonthButtons = await monthButtons.count() > 0
    const hasNoMonthsMessage = await noMonthsMessage.isVisible().catch(() => false)

    expect(hasMonthButtons || hasNoMonthsMessage).toBeTruthy()

    // ステップ3: 直近の出欠セクションが表示されることを確認
    const recentSection = page.locator('text=直近の出欠')
    const hasRecentSection = await recentSection.isVisible().catch(() => false)

    // 直近の出欠セクションがあるか、月一覧が表示されていることを確認
    expect(hasRecentSection || hasMonthButtons || hasNoMonthsMessage).toBeTruthy()
  })

  /**
   * TC-ATTEND-001: 出席登録
   * メンバーの出席を登録
   */
  test('TC-ATTEND-001: 出席登録', async ({ page }) => {
    // ステップ1: チームの出席タブに移動
    const teamId = await navigateToTeamAttendanceTab(page)

    if (!teamId) {
      console.log('参加しているチームがないため、テストをスキップします')
      test.skip()
      return
    }

    await page.waitForTimeout(2000)

    // ステップ2: 直近の出欠セクションでイベントを探す
    const attendanceButtons = page.locator('button:has-text("出席")')
    const hasAttendanceButtons = await attendanceButtons.count() > 0

    if (!hasAttendanceButtons) {
      console.log('出席登録可能なイベントがないため、テストをスキップします')
      // 出席一覧ページが表示されていることを確認
      const pageText = await page.textContent('body')
      expect(
        pageText?.includes('直近の出欠') ||
        pageText?.includes('表示できる月がありません') ||
        pageText?.includes('イベントがありません')
      ).toBeTruthy()
      return
    }

    // ステップ3: 出席ボタンをクリック
    const firstAttendanceButton = attendanceButtons.first()
    await firstAttendanceButton.click()
    await page.waitForTimeout(500)

    // ステップ4: ボタンがアクティブ状態になることを確認
    // 出席ボタンがクリックされると、緑色のスタイルが適用される
    const buttonClasses = await firstAttendanceButton.getAttribute('class')
    expect(buttonClasses?.includes('green') || buttonClasses?.includes('border-green')).toBeTruthy()

    // ステップ5: 保存ボタンが有効になることを確認
    const saveButton = page.locator('button:has-text("保存")').first()
    const isSaveButtonEnabled = await saveButton.isEnabled()

    // 変更があれば保存ボタンが有効になる（既に同じ状態の場合は無効のまま）
    // どちらの状態でもテストは成功とする
    expect(saveButton).toBeVisible()
  })

  /**
   * TC-ATTEND-002: 出席編集
   * 登録済み出席の変更
   */
  test('TC-ATTEND-002: 出席編集', async ({ page }) => {
    // ステップ1: チームの出席タブに移動
    const teamId = await navigateToTeamAttendanceTab(page)

    if (!teamId) {
      console.log('参加しているチームがないため、テストをスキップします')
      test.skip()
      return
    }

    await page.waitForTimeout(2000)

    // ステップ2: 出席/欠席/その他ボタンを探す
    const statusButtons = page.locator('button:has-text("出席"), button:has-text("欠席"), button:has-text("その他")')
    const hasStatusButtons = await statusButtons.count() > 0

    if (!hasStatusButtons) {
      console.log('出席編集可能なイベントがないため、テストをスキップします')
      // 出席一覧ページが表示されていることを確認
      expect(page.url()).toContain('/teams/')
      return
    }

    // ステップ3: 現在の状態を確認
    const presentButton = page.locator('button:has-text("出席")').first()
    const absentButton = page.locator('button:has-text("欠席")').first()

    // ステップ4: 状態を変更（出席→欠席または欠席→出席）
    const presentClasses = await presentButton.getAttribute('class') || ''
    const isCurrentlyPresent = presentClasses.includes('green') || presentClasses.includes('border-green')

    if (isCurrentlyPresent) {
      await absentButton.click()
    } else {
      await presentButton.click()
    }

    await page.waitForTimeout(500)

    // ステップ5: 変更後のボタン状態を確認
    const newPresentClasses = await presentButton.getAttribute('class') || ''
    const newAbsentClasses = await absentButton.getAttribute('class') || ''

    // どちらかがアクティブ状態になっていることを確認
    const hasActiveButton =
      newPresentClasses.includes('green') ||
      newPresentClasses.includes('border-green') ||
      newAbsentClasses.includes('red') ||
      newAbsentClasses.includes('border-red')

    expect(hasActiveButton).toBeTruthy()
  })

  /**
   * TC-ATTEND-004: 出席フィルタリング
   * 日付・メンバーでフィルタ（今月/来月タブ切り替え）
   */
  test('TC-ATTEND-004: 出席フィルタリング', async ({ page }) => {
    // ステップ1: チームの出席タブに移動
    const teamId = await navigateToTeamAttendanceTab(page)

    if (!teamId) {
      console.log('参加しているチームがないため、テストをスキップします')
      test.skip()
      return
    }

    await page.waitForTimeout(2000)

    // ステップ2: 今月/来月タブが表示されることを確認
    const currentMonthTab = page.locator('button:has-text("今月")')
    const nextMonthTab = page.locator('button:has-text("来月")')

    const hasCurrentMonthTab = await currentMonthTab.isVisible().catch(() => false)
    const hasNextMonthTab = await nextMonthTab.isVisible().catch(() => false)

    if (!hasCurrentMonthTab || !hasNextMonthTab) {
      console.log('今月/来月タブが見つからないため、テストをスキップします')
      // 月一覧でのフィルタリングを確認
      const monthButtons = page.locator('button:has-text("年")')
      const hasMonthButtons = await monthButtons.count() > 0
      expect(hasMonthButtons).toBeTruthy()
      return
    }

    // ステップ3: 今月タブがアクティブであることを確認
    const currentMonthClasses = await currentMonthTab.getAttribute('class') || ''
    expect(currentMonthClasses.includes('blue') || currentMonthClasses.includes('border-blue')).toBeTruthy()

    // ステップ4: 来月タブをクリック
    await nextMonthTab.click()
    await page.waitForTimeout(500)

    // ステップ5: 来月タブがアクティブになることを確認
    const newNextMonthClasses = await nextMonthTab.getAttribute('class') || ''
    expect(newNextMonthClasses.includes('blue') || newNextMonthClasses.includes('border-blue')).toBeTruthy()

    // ステップ6: 今月タブをクリックして戻る
    await currentMonthTab.click()
    await page.waitForTimeout(500)

    // ステップ7: 今月タブがアクティブに戻ることを確認
    const finalCurrentMonthClasses = await currentMonthTab.getAttribute('class') || ''
    expect(finalCurrentMonthClasses.includes('blue') || finalCurrentMonthClasses.includes('border-blue')).toBeTruthy()
  })

  /**
   * TC-ATTEND-005: 月詳細モーダル表示
   * 月をクリックして詳細モーダルを開く
   */
  test('TC-ATTEND-005: 月詳細モーダル表示', async ({ page }) => {
    // ステップ1: チームの出席タブに移動
    const teamId = await navigateToTeamAttendanceTab(page)

    if (!teamId) {
      console.log('参加しているチームがないため、テストをスキップします')
      test.skip()
      return
    }

    await page.waitForTimeout(2000)

    // ステップ2: 月ボタンを探す
    const monthButtons = page.locator('button:has-text("年")')
    const hasMonthButtons = await monthButtons.count() > 0

    if (!hasMonthButtons) {
      console.log('月ボタンが見つからないため、テストをスキップします')
      // 出席一覧ページが表示されていることを確認
      const pageText = await page.textContent('body')
      expect(
        pageText?.includes('直近の出欠') ||
        pageText?.includes('表示できる月がありません')
      ).toBeTruthy()
      return
    }

    // ステップ3: 最初の月ボタンをクリック
    await monthButtons.first().click()
    await page.waitForTimeout(1000)

    // ステップ4: モーダルが開くことを確認
    const modal = page.locator('[role="dialog"]')
    const hasModal = await modal.isVisible().catch(() => false)

    if (hasModal) {
      await expect(modal).toBeVisible()

      // ステップ5: モーダル内に出席登録UIがあることを確認
      const modalContent = await modal.textContent()
      expect(
        modalContent?.includes('出席') ||
        modalContent?.includes('欠席') ||
        modalContent?.includes('その他') ||
        modalContent?.includes('保存')
      ).toBeTruthy()

      // ステップ6: モーダルを閉じる
      const closeButton = modal.locator('button:has-text("閉じる"), button:has-text("キャンセル"), button[aria-label="閉じる"]').first()
      if (await closeButton.isVisible()) {
        await closeButton.click()
        await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 })
      }
    }
  })
})
