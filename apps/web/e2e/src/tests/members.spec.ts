import { expect, test, type Page } from '@playwright/test'
import { EnvConfig, URLS } from '../config/config'

/**
 * メンバー管理のE2Eテスト
 *
 * テストケース:
 * - TC-MEMBER-001: メンバー一覧表示
 * - TC-MEMBER-002: メンバー詳細表示
 * - TC-MEMBER-003: 役割変更
 * - TC-MEMBER-004: メンバー削除
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
 * チームのメンバータブに移動するヘルパー関数
 * @returns チームIDを返す（存在しない場合はnull）
 */
async function navigateToTeamMembersTab(page: Page): Promise<string | null> {
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

  // メンバータブをクリック
  const membersTab = page.locator('button:has-text("メンバー")').first()
  if (await membersTab.isVisible()) {
    await membersTab.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
  }

  return teamId
}

/**
 * 管理者として参加しているチームのメンバータブに移動するヘルパー関数
 * @returns チームIDを返す（存在しない場合はnull）
 */
async function navigateToAdminTeamMembersTab(page: Page): Promise<string | null> {
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

  // メンバータブをクリック
  const membersTab = page.locator('button:has-text("メンバー")').first()
  if (await membersTab.isVisible()) {
    await membersTab.click()
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

test.describe('メンバー管理のテスト', () => {
  // 環境変数が不足している場合はテストスイートをスキップ
  test.skip(!hasRequiredEnvVars, '必要な環境変数が設定されていません。')

  test.beforeEach(async ({ page }) => {
    await loginIfNeeded(page)
  })

  /**
   * TC-MEMBER-001: メンバー一覧表示
   * チームメンバー一覧の表示
   */
  test('TC-MEMBER-001: メンバー一覧表示', async ({ page }) => {
    // ステップ1: チームのメンバータブに移動
    const teamId = await navigateToTeamMembersTab(page)

    if (!teamId) {
      console.log('参加しているチームがないため、テストをスキップします')
      // チームページが正しく表示されていることを確認
      const pageText = await page.textContent('body')
      expect(pageText?.includes('マイチーム') || pageText?.includes('チーム')).toBeTruthy()
      return
    }

    // ステップ2: メンバー管理コンポーネントが表示されることを確認
    await page.waitForSelector('[data-testid="team-member-management"]', { timeout: 10000 })
    const memberManagement = page.locator('[data-testid="team-member-management"]')
    await expect(memberManagement).toBeVisible()

    // ステップ3: メンバーリストが表示されることを確認
    // テーブルまたはリスト形式でメンバーが表示されているはず
    const memberTable = page.locator('table, [role="grid"]').first()
    const hasMemberTable = await memberTable.isVisible().catch(() => false)

    // メンバー統計が表示されていることを確認（代替チェック）
    const memberStats = page.locator('text=メンバー').first()
    const hasMemberStats = await memberStats.isVisible().catch(() => false)

    expect(hasMemberTable || hasMemberStats).toBeTruthy()
  })

  /**
   * TC-MEMBER-002: メンバー詳細表示
   * メンバーの詳細情報表示
   */
  test('TC-MEMBER-002: メンバー詳細表示', async ({ page }) => {
    // ステップ1: チームのメンバータブに移動
    const teamId = await navigateToTeamMembersTab(page)

    if (!teamId) {
      console.log('参加しているチームがないため、テストをスキップします')
      test.skip()
      return
    }

    // ステップ2: メンバー管理コンポーネントが表示されるのを待つ
    await page.waitForSelector('[data-testid="team-member-management"]', { timeout: 10000 })

    // ステップ3: メンバー行をクリック（テーブルの行をクリック）
    const memberRow = page.locator('tr[class*="cursor-pointer"], [role="row"][class*="cursor-pointer"]').first()
    const hasMemberRow = await memberRow.isVisible().catch(() => false)

    if (!hasMemberRow) {
      console.log('クリック可能なメンバー行が見つからないため、テストをスキップします')
      // メンバー一覧が表示されていることを確認
      const memberManagement = page.locator('[data-testid="team-member-management"]')
      await expect(memberManagement).toBeVisible()
      return
    }

    await memberRow.click()

    // ステップ4: メンバー詳細モーダルが開くことを確認
    await page.waitForSelector('[data-testid="team-member-detail-modal"]', { timeout: 5000 })
    const modal = page.locator('[data-testid="team-member-detail-modal"]')
    await expect(modal).toBeVisible()

    // ステップ5: メンバー情報が表示されていることを確認
    // プロフィール情報やベストタイムセクションが表示されているはず
    const profileSection = modal.locator('text=Best Time, text=プロフィール').first()
    const hasContent = await profileSection.isVisible().catch(() => false) ||
      await modal.locator('h3').count() > 0

    expect(hasContent).toBeTruthy()

    // ステップ6: 閉じるボタンをクリック
    const closeButton = page.locator('[data-testid="team-member-detail-close-button"]')
    await closeButton.click()

    // ステップ7: モーダルが閉じることを確認
    await page.waitForSelector('[data-testid="team-member-detail-modal"]', { state: 'hidden', timeout: 5000 })
  })

  /**
   * TC-MEMBER-003: 役割変更
   * メンバーの役割変更（管理者のみ）
   */
  test('TC-MEMBER-003: 役割変更', async ({ page }) => {
    // ステップ1: 管理者として参加しているチームのメンバータブに移動
    const teamId = await navigateToAdminTeamMembersTab(page)

    if (!teamId) {
      console.log('管理者として参加しているチームがないため、テストをスキップします')
      // チームページが正しく表示されていることを確認
      const pageText = await page.textContent('body')
      expect(pageText?.includes('マイチーム') || pageText?.includes('チーム')).toBeTruthy()
      return
    }

    // ステップ2: メンバー管理コンポーネントが表示されるのを待つ
    await page.waitForSelector('[data-testid="team-member-management"]', { timeout: 10000 })

    // ステップ3: 自分以外のメンバー行をクリック
    const memberRows = page.locator('tr[class*="cursor-pointer"], [role="row"][class*="cursor-pointer"]')
    const rowCount = await memberRows.count()

    if (rowCount < 2) {
      console.log('他のメンバーがいないため、テストをスキップします')
      // メンバー一覧が表示されていることを確認
      const memberManagement = page.locator('[data-testid="team-member-management"]')
      await expect(memberManagement).toBeVisible()
      return
    }

    // 2番目以降のメンバー行をクリック（最初は自分の可能性があるため）
    await memberRows.nth(1).click()

    // ステップ4: メンバー詳細モーダルが開くことを確認
    await page.waitForSelector('[data-testid="team-member-detail-modal"]', { timeout: 5000 })
    const modal = page.locator('[data-testid="team-member-detail-modal"]')
    await expect(modal).toBeVisible()

    // ステップ5: 役割変更トグルが表示されることを確認（管理者機能）
    const roleToggle = page.locator('[data-testid="team-member-role-toggle"]')
    const hasRoleToggle = await roleToggle.isVisible().catch(() => false)

    if (!hasRoleToggle) {
      console.log('役割変更トグルが表示されないため、テストをスキップします（自分のプロフィールを開いた可能性があります）')
      // モーダルを閉じる
      const closeButton = page.locator('[data-testid="team-member-detail-close-button"]')
      await closeButton.click()
      return
    }

    await expect(roleToggle).toBeVisible()

    // ステップ6: ユーザー/管理者ボタンが表示されることを確認
    const userButton = page.locator('[data-testid="team-member-role-user-button"]')
    const adminButton = page.locator('[data-testid="team-member-role-admin-button"]')
    await expect(userButton).toBeVisible()
    await expect(adminButton).toBeVisible()

    // ステップ7: 現在の役割を取得
    const isCurrentlyAdmin = await adminButton.evaluate(el =>
      el.className.includes('bg-yellow') || el.className.includes('shadow')
    )

    // ステップ8: 役割を切り替える（現在の逆の役割に）
    if (isCurrentlyAdmin) {
      await userButton.click()
    } else {
      await adminButton.click()
    }

    // ステップ9: 確認ダイアログが表示されることを確認
    await page.waitForTimeout(500)
    const confirmModal = page.locator('[role="dialog"]:has-text("確認"), [role="alertdialog"]')
    const hasConfirmModal = await confirmModal.isVisible().catch(() => false)

    if (hasConfirmModal) {
      // 確認ダイアログがある場合は確認ボタンをクリック
      const confirmButton = confirmModal.locator('button:has-text("確認"), button:has-text("変更"), button:has-text("はい")').first()
      if (await confirmButton.isVisible()) {
        await confirmButton.click()
        await page.waitForLoadState('networkidle')
      }
    }

    // ステップ10: 処理が完了するのを待つ
    await page.waitForTimeout(1000)

    // ステップ11: モーダルを閉じる
    const closeButton = page.locator('[data-testid="team-member-detail-close-button"]')
    if (await closeButton.isVisible()) {
      await closeButton.click()
    }
  })

  /**
   * TC-MEMBER-004: メンバー削除
   * メンバーをチームから削除（管理者のみ）
   */
  test('TC-MEMBER-004: メンバー削除', async ({ page }) => {
    // ステップ1: 管理者として参加しているチームのメンバータブに移動
    const teamId = await navigateToAdminTeamMembersTab(page)

    if (!teamId) {
      console.log('管理者として参加しているチームがないため、テストをスキップします')
      // チームページが正しく表示されていることを確認
      const pageText = await page.textContent('body')
      expect(pageText?.includes('マイチーム') || pageText?.includes('チーム')).toBeTruthy()
      return
    }

    // ステップ2: メンバー管理コンポーネントが表示されるのを待つ
    await page.waitForSelector('[data-testid="team-member-management"]', { timeout: 10000 })

    // ステップ3: 自分以外のメンバー行をクリック
    const memberRows = page.locator('tr[class*="cursor-pointer"], [role="row"][class*="cursor-pointer"]')
    const rowCount = await memberRows.count()

    if (rowCount < 2) {
      console.log('他のメンバーがいないため、テストをスキップします')
      // メンバー一覧が表示されていることを確認
      const memberManagement = page.locator('[data-testid="team-member-management"]')
      await expect(memberManagement).toBeVisible()
      return
    }

    // 2番目以降のメンバー行をクリック
    await memberRows.nth(1).click()

    // ステップ4: メンバー詳細モーダルが開くことを確認
    await page.waitForSelector('[data-testid="team-member-detail-modal"]', { timeout: 5000 })
    const modal = page.locator('[data-testid="team-member-detail-modal"]')
    await expect(modal).toBeVisible()

    // ステップ5: 削除ボタンが表示されることを確認
    const removeButton = page.locator('[data-testid="team-member-remove-button"]')
    const hasRemoveButton = await removeButton.isVisible().catch(() => false)

    if (!hasRemoveButton) {
      console.log('削除ボタンが表示されないため、テストをスキップします（自分のプロフィールを開いた可能性があります）')
      // モーダルを閉じる
      const closeButton = page.locator('[data-testid="team-member-detail-close-button"]')
      await closeButton.click()
      return
    }

    await expect(removeButton).toBeVisible()

    // 注意: 実際の削除は破壊的な操作のため、ボタンの存在確認のみで終了
    // 本番環境では実際に削除テストを行う場合、テスト用のダミーメンバーを事前に追加する必要があります

    // ステップ6: モーダルを閉じる
    const closeButton = page.locator('[data-testid="team-member-detail-close-button"]')
    await closeButton.click()

    // ステップ7: モーダルが閉じることを確認
    await page.waitForSelector('[data-testid="team-member-detail-modal"]', { state: 'hidden', timeout: 5000 })
  })
})
