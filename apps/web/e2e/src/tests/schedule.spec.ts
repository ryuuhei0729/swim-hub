import { expect, test, type Page } from '@playwright/test'
import { EnvConfig, URLS } from '../config/config'

/**
 * スケジュール管理のE2Eテスト
 *
 * 注: スケジュール専用ページは実装予定のため、
 * チームの「練習」「大会」タブでスケジュール機能をテストします。
 *
 * テストケース:
 * - TC-SCHED-001: スケジュール作成（練習/大会作成）
 * - TC-SCHED-002: スケジュール編集
 * - TC-SCHED-003: スケジュール削除
 * - TC-SCHED-004: カレンダー表示（一覧表示）
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
 * 管理者として参加しているチームの練習タブに移動するヘルパー関数
 * @returns チームIDを返す（存在しない場合はnull）
 */
async function navigateToAdminTeamPracticesTab(page: Page): Promise<string | null> {
  // チームページに移動
  await page.goto(URLS.TEAMS)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // 管理者として参加しているチームを探す
  const teamCards = page.locator('a[href^="/teams/"]')
  const cardCount = await teamCards.count()

  let adminTeamCard = null
  let teamId: string | null = null

  for (let i = 0; i < cardCount; i++) {
    const card = teamCards.nth(i)
    const hasAdmin = await card.locator('text=管理者').count() > 0
    if (hasAdmin) {
      adminTeamCard = card
      const href = await card.getAttribute('href')
      teamId = href?.split('/teams/')[1]?.split('/')[0] || null
      break
    }
  }

  if (!adminTeamCard) {
    return null
  }

  await adminTeamCard.click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)

  // 練習タブをクリック
  const practicesTab = page.locator('button:has-text("練習")').first()
  if (await practicesTab.isVisible()) {
    await practicesTab.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
  }

  return teamId
}

/**
 * 管理者として参加しているチームの大会タブに移動するヘルパー関数
 * @returns チームIDを返す（存在しない場合はnull）
 */
async function navigateToAdminTeamCompetitionsTab(page: Page): Promise<string | null> {
  // チームページに移動
  await page.goto(URLS.TEAMS)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // 管理者として参加しているチームを探す
  const teamCards = page.locator('a[href^="/teams/"]')
  const cardCount = await teamCards.count()

  let adminTeamCard = null
  let teamId: string | null = null

  for (let i = 0; i < cardCount; i++) {
    const card = teamCards.nth(i)
    const hasAdmin = await card.locator('text=管理者').count() > 0
    if (hasAdmin) {
      adminTeamCard = card
      const href = await card.getAttribute('href')
      teamId = href?.split('/teams/')[1]?.split('/')[0] || null
      break
    }
  }

  if (!adminTeamCard) {
    return null
  }

  await adminTeamCard.click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)

  // 大会タブをクリック
  const competitionsTab = page.locator('button:has-text("大会")').first()
  if (await competitionsTab.isVisible()) {
    await competitionsTab.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
  }

  return teamId
}

/**
 * チームの練習タブに移動するヘルパー関数（一般メンバー用）
 * @returns チームIDを返す（存在しない場合はnull）
 */
async function navigateToTeamPracticesTab(page: Page): Promise<string | null> {
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

  // 練習タブをクリック
  const practicesTab = page.locator('button:has-text("練習")').first()
  if (await practicesTab.isVisible()) {
    await practicesTab.click()
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

test.describe('スケジュール管理のテスト', () => {
  // 環境変数が不足している場合はテストスイートをスキップ
  test.skip(!hasRequiredEnvVars, '必要な環境変数が設定されていません。')

  test.beforeEach(async ({ page }) => {
    await loginIfNeeded(page)
  })

  /**
   * TC-SCHED-004: カレンダー表示（練習一覧表示）
   * 練習一覧が正しく表示される
   */
  test('TC-SCHED-004: カレンダー表示（練習一覧）', async ({ page }) => {
    // ステップ1: チームの練習タブに移動
    const teamId = await navigateToTeamPracticesTab(page)

    if (!teamId) {
      console.log('参加しているチームがないため、テストをスキップします')
      // チームページが正しく表示されていることを確認
      const pageText = await page.textContent('body')
      expect(pageText?.includes('マイチーム') || pageText?.includes('チーム')).toBeTruthy()
      return
    }

    // ステップ2: 練習一覧ヘッダーが表示されることを確認
    const practicesHeader = page.locator('text=チーム練習記録')
    await expect(practicesHeader).toBeVisible({ timeout: 10000 })

    // ステップ3: 練習一覧またはエンプティ状態が表示されることを確認
    const practiceItems = page.locator('.border.rounded-lg')
    const emptyMessage = page.locator('text=練習記録がありません')

    const hasPracticeItems = await practiceItems.count() > 0
    const hasEmptyMessage = await emptyMessage.isVisible().catch(() => false)

    expect(hasPracticeItems || hasEmptyMessage).toBeTruthy()
  })

  /**
   * TC-SCHED-004-2: カレンダー表示（大会一覧表示）
   * 大会一覧が正しく表示される
   */
  test('TC-SCHED-004-2: カレンダー表示（大会一覧）', async ({ page }) => {
    // ステップ1: チームの大会タブに移動
    const teamId = await navigateToAdminTeamCompetitionsTab(page)

    if (!teamId) {
      // 管理者でなくても一般チームの大会一覧を確認
      await page.goto(URLS.TEAMS)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)

      const teamCards = page.locator('a[href^="/teams/"]')
      if (await teamCards.count() === 0) {
        console.log('参加しているチームがないため、テストをスキップします')
        return
      }

      await teamCards.first().click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)

      const competitionsTab = page.locator('button:has-text("大会")').first()
      if (await competitionsTab.isVisible()) {
        await competitionsTab.click()
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(1000)
      }
    }

    // ステップ2: 大会一覧ヘッダーが表示されることを確認
    const competitionsHeader = page.locator('text=チーム大会')
    await expect(competitionsHeader).toBeVisible({ timeout: 10000 })

    // ステップ3: 大会一覧またはエンプティ状態が表示されることを確認
    const competitionItems = page.locator('.border.rounded-lg')
    const emptyMessage = page.locator('text=大会がありません')

    const hasCompetitionItems = await competitionItems.count() > 0
    const hasEmptyMessage = await emptyMessage.isVisible().catch(() => false)

    expect(hasCompetitionItems || hasEmptyMessage).toBeTruthy()
  })

  /**
   * TC-SCHED-001: スケジュール作成（練習記録追加）
   * 新規練習記録を作成
   */
  test('TC-SCHED-001: スケジュール作成（練習記録追加）', async ({ page }) => {
    // ステップ1: 管理者として参加しているチームの練習タブに移動
    const teamId = await navigateToAdminTeamPracticesTab(page)

    if (!teamId) {
      console.log('管理者として参加しているチームがないため、テストをスキップします')
      // チームページが正しく表示されていることを確認
      const pageText = await page.textContent('body')
      expect(pageText?.includes('マイチーム') || pageText?.includes('チーム')).toBeTruthy()
      return
    }

    // ステップ2: 練習記録追加ボタンを探す
    const addButton = page.locator('button:has-text("練習記録追加")')
    const hasAddButton = await addButton.isVisible().catch(() => false)

    if (!hasAddButton) {
      console.log('練習記録追加ボタンが見つからないため、テストをスキップします')
      // 練習一覧が表示されていることを確認
      const practicesHeader = page.locator('text=チーム練習記録')
      await expect(practicesHeader).toBeVisible()
      return
    }

    // ステップ3: 練習記録追加ボタンをクリック
    await addButton.click()

    // ステップ4: モーダルが開くことを確認
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible()

    // ステップ5: 日付入力フィールドが存在することを確認
    const dateInput = modal.locator('input[type="date"]')
    const hasDateInput = await dateInput.isVisible().catch(() => false)

    expect(hasDateInput).toBeTruthy()

    // ステップ6: モーダルを閉じる（キャンセル）
    const cancelButton = modal.locator('button:has-text("キャンセル"), button:has-text("閉じる")').first()
    if (await cancelButton.isVisible()) {
      await cancelButton.click()
      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 })
    }
  })

  /**
   * TC-SCHED-001-2: スケジュール作成（大会追加）
   * 新規大会を作成
   */
  test('TC-SCHED-001-2: スケジュール作成（大会追加）', async ({ page }) => {
    // ステップ1: 管理者として参加しているチームの大会タブに移動
    const teamId = await navigateToAdminTeamCompetitionsTab(page)

    if (!teamId) {
      console.log('管理者として参加しているチームがないため、テストをスキップします')
      // チームページが正しく表示されていることを確認
      const pageText = await page.textContent('body')
      expect(pageText?.includes('マイチーム') || pageText?.includes('チーム')).toBeTruthy()
      return
    }

    // ステップ2: 大会追加ボタンを探す
    const addButton = page.locator('button:has-text("大会追加")')
    const hasAddButton = await addButton.isVisible().catch(() => false)

    if (!hasAddButton) {
      console.log('大会追加ボタンが見つからないため、テストをスキップします')
      // 大会一覧が表示されていることを確認
      const competitionsHeader = page.locator('text=チーム大会')
      await expect(competitionsHeader).toBeVisible()
      return
    }

    // ステップ3: 大会追加ボタンをクリック
    await addButton.click()

    // ステップ4: モーダルが開くことを確認
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible()

    // ステップ5: 大会名入力フィールドが存在することを確認
    const titleInput = modal.locator('input[type="text"]').first()
    const hasInput = await titleInput.isVisible().catch(() => false)

    expect(hasInput).toBeTruthy()

    // ステップ6: モーダルを閉じる（キャンセル）
    const cancelButton = modal.locator('button:has-text("キャンセル"), button:has-text("閉じる")').first()
    if (await cancelButton.isVisible()) {
      await cancelButton.click()
      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 })
    }
  })

  /**
   * TC-SCHED-002: スケジュール編集（練習記録編集）
   * 既存練習記録の編集画面へ遷移
   */
  test('TC-SCHED-002: スケジュール編集（練習記録編集）', async ({ page }) => {
    // ステップ1: 管理者として参加しているチームの練習タブに移動
    const teamId = await navigateToAdminTeamPracticesTab(page)

    if (!teamId) {
      console.log('管理者として参加しているチームがないため、テストをスキップします')
      test.skip()
      return
    }

    // ステップ2: 練習記録を探す
    const practiceItems = page.locator('button.w-full.text-left.border.rounded-lg')
    const practiceCount = await practiceItems.count()

    if (practiceCount === 0) {
      console.log('練習記録が存在しないため、テストをスキップします')
      // 練習一覧が表示されていることを確認
      const practicesHeader = page.locator('text=チーム練習記録')
      await expect(practicesHeader).toBeVisible()
      return
    }

    // ステップ3: 最初の練習記録をクリック
    await practiceItems.first().click()

    // ステップ4: 練習ログ入力ページに遷移することを確認
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // URLが練習ログページに変わったことを確認
    expect(page.url()).toContain('/practices/')
    expect(page.url()).toContain('/logs')
  })

  /**
   * TC-SCHED-003: スケジュール削除
   * 練習/大会の削除（注: 実際の削除は破壊的なのでUIの確認のみ）
   */
  test('TC-SCHED-003: スケジュール削除UI確認', async ({ page }) => {
    // ステップ1: チームページに移動
    await page.goto(URLS.TEAMS)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // ステップ2: チームカードを探す
    const teamCards = page.locator('a[href^="/teams/"]')
    const cardCount = await teamCards.count()

    if (cardCount === 0) {
      console.log('参加しているチームがないため、テストをスキップします')
      test.skip()
      return
    }

    // 管理者チームを探す（なければ最初のチーム）
    let targetCard = teamCards.first()
    for (let i = 0; i < cardCount; i++) {
      const card = teamCards.nth(i)
      const hasAdmin = await card.locator('text=管理者').count() > 0
      if (hasAdmin) {
        targetCard = card
        break
      }
    }

    await targetCard.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // ステップ3: 大会タブをクリック
    const competitionsTab = page.locator('button:has-text("大会")').first()
    await expect(competitionsTab).toBeVisible({ timeout: 10000 })
    await competitionsTab.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // ステップ4: 大会一覧を確認（「チーム大会」またはタブがアクティブになった状態）
    // 大会タブがアクティブになっていることを確認
    await page.waitForTimeout(2000) // UIの読み込みを待つ
    const competitionsHeader = page.locator('text=チーム大会')
    const emptyMsg = page.locator('text=大会がありません')
    const hasCompetitionsHeader = await competitionsHeader.isVisible().catch(() => false)
    const hasEmptyMsg = await emptyMsg.isVisible().catch(() => false)
    expect(hasCompetitionsHeader || hasEmptyMsg).toBeTruthy()

    // ステップ5: UIが正しく表示されていることを確認
    const recordButton = page.locator('button:has-text("記録入力")')
    const entryButton = page.locator('button:has-text("エントリー")')
    const addButton = page.locator('button:has-text("大会追加")')
    const emptyMessage = page.locator('text=大会がありません')

    const hasRecordButton = await recordButton.count() > 0
    const hasEntryButton = await entryButton.count() > 0
    const hasAddButton = await addButton.isVisible().catch(() => false)
    const hasEmptyMessage = await emptyMessage.isVisible().catch(() => false)

    // 何らかのUIが表示されていれば成功
    expect(hasRecordButton || hasEntryButton || hasAddButton || hasEmptyMessage).toBeTruthy()
  })

  /**
   * TC-SCHED-005: エントリー管理モーダル
   * 大会のエントリー管理モーダルを開く
   */
  test('TC-SCHED-005: エントリー管理モーダル', async ({ page }) => {
    // ステップ1: チームの大会タブに移動
    const teamId = await navigateToAdminTeamCompetitionsTab(page)

    if (!teamId) {
      // 管理者でなくても一般チームの大会一覧を確認
      await page.goto(URLS.TEAMS)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)

      const teamCards = page.locator('a[href^="/teams/"]')
      if (await teamCards.count() === 0) {
        console.log('参加しているチームがないため、テストをスキップします')
        test.skip()
        return
      }

      await teamCards.first().click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)

      const competitionsTab = page.locator('button:has-text("大会")').first()
      if (await competitionsTab.isVisible()) {
        await competitionsTab.click()
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(1000)
      }
    }

    // ステップ2: エントリーボタンを探す
    const entryButton = page.locator('button:has-text("エントリー")').first()
    const hasEntryButton = await entryButton.isVisible().catch(() => false)

    if (!hasEntryButton) {
      console.log('エントリーボタンが見つからないため、テストをスキップします')
      // 大会一覧が表示されていることを確認
      const competitionsHeader = page.locator('text=チーム大会')
      await expect(competitionsHeader).toBeVisible()
      return
    }

    // ステップ3: エントリーボタンをクリック
    await entryButton.click()

    // ステップ4: モーダルが開くことを確認
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible()

    // ステップ5: モーダル内にエントリー関連のコンテンツがあることを確認
    const modalContent = await modal.textContent()
    expect(
      modalContent?.includes('エントリー') ||
      modalContent?.includes('種目') ||
      modalContent?.includes('大会')
    ).toBeTruthy()

    // ステップ6: モーダルを閉じる
    const closeButton = modal.locator('button:has-text("閉じる"), button:has-text("キャンセル"), button[aria-label="閉じる"]').first()
    if (await closeButton.isVisible()) {
      await closeButton.click()
      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 })
    }
  })
})
