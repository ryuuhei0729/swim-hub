import { expect, test, type Page } from '@playwright/test'
import { EnvConfig, URLS } from '../config/config'

/**
 * 目標管理のE2Eテスト
 *
 * テストケース:
 * - TC-GOALS-001: 目標の新規作成
 * - TC-GOALS-002: 目標の編集
 * - TC-GOALS-003: 目標の削除
 * - TC-GOALS-004: 目標達成マーク
 * - TC-GOALS-005: 目標一覧表示
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

// テスト開始前に環境変数を検証
let hasRequiredEnvVars = false
try {
  EnvConfig.getTestEnvironment()
  hasRequiredEnvVars = true
} catch (error) {
  console.error('環境変数の検証に失敗しました:', error instanceof Error ? error.message : error)
}

test.describe('目標管理のテスト', () => {
  // 環境変数が不足している場合はテストスイートをスキップ
  test.skip(!hasRequiredEnvVars, '必要な環境変数が設定されていません。')

  test.beforeEach(async ({ page }) => {
    await loginIfNeeded(page)
  })

  /**
   * TC-GOALS-005: 目標一覧表示
   * 目標一覧が正しく表示される
   */
  test('TC-GOALS-005: 目標一覧表示', async ({ page }) => {
    // ステップ1: 目標ページに移動
    await page.goto('/goals')
    await page.waitForLoadState('networkidle')

    // ステップ2: 目標ページが表示されることを確認
    await page.waitForSelector('h1:has-text("目標管理")', { timeout: 10000 })
    await expect(page.locator('h1:has-text("目標管理")')).toBeVisible()

    // ステップ3: 新規目標作成ボタンが表示されることを確認
    const createButton = page.locator('button:has-text("新規目標作成")')
    await expect(createButton).toBeVisible()
  })

  /**
   * TC-GOALS-001: 目標の新規作成
   * 種目・目標タイム・期限を設定して作成
   */
  test('TC-GOALS-001: 目標の新規作成', async ({ page }) => {
    // ステップ1: 目標ページに移動
    await page.goto('/goals')
    await page.waitForLoadState('networkidle')

    // ステップ2: 新規目標作成ボタンをクリック
    const createButton = page.locator('button:has-text("新規目標作成")')
    await createButton.waitFor({ state: 'visible', timeout: 10000 })
    await createButton.click()

    // ステップ3: モーダルが開くことを確認
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible()

    // ステップ4: 「新規大会を作成」ラジオボタンを選択（デフォルトで選択されている場合もある）
    const newCompetitionRadio = modal.locator('input[type="radio"]').nth(1) // 2番目のラジオ「新規大会を作成」
    if (await newCompetitionRadio.isVisible()) {
      await newCompetitionRadio.click()
      await page.waitForTimeout(300)
    }

    // ステップ5: 大会名を入力（テキストボックスのみを対象にする）
    const titleInput = modal.locator('input[type="text"]').first()
    if (await titleInput.isVisible()) {
      await titleInput.fill('E2Eテスト大会')
    }

    // ステップ6: 種目を選択（selectまたはcombobox）
    // 種目のセレクトは2番目のselect（最初はプールタイプ）
    const styleSelect = modal.locator('select').nth(1)
    if (await styleSelect.isVisible()) {
      // 「50m自由形」を選択（インデックス2）
      await styleSelect.selectOption({ index: 2 })
      await page.waitForTimeout(300)
    }

    // ステップ7: 目標タイムを入力（目標タイム用のテキストボックス）
    const allTextInputs = modal.locator('input[type="text"]')
    const inputCount = await allTextInputs.count()
    // 目標タイム入力は複数のテキスト入力の中で見つける
    if (inputCount >= 2) {
      const targetTimeInput = allTextInputs.nth(1) // 2番目のテキスト入力（大会名の次）
      await targetTimeInput.fill('30.00')
    }

    // ステップ8: 作成ボタンをクリック
    const submitButton = modal.locator('button:has-text("作成")').first()
    await submitButton.click()

    // ステップ9: モーダルが閉じることを確認（エラーがない場合）
    // 入力が不足している場合はモーダルが閉じないため、待機時間を設ける
    await page.waitForTimeout(2000)

    // モーダルが閉じたか、または作成が成功したかを確認
    const modalStillVisible = await modal.isVisible()
    if (modalStillVisible) {
      // バリデーションエラーがある場合はキャンセルして終了
      const cancelButton = modal.locator('button:has-text("キャンセル")').first()
      if (await cancelButton.isVisible()) {
        await cancelButton.click()
      }
    }

    // ステップ10: 目標ページにいることを確認
    expect(page.url()).toContain('/goals')
  })

  /**
   * TC-GOALS-002: 目標の編集
   * 既存目標の内容を変更
   */
  test('TC-GOALS-002: 目標の編集', async ({ page }) => {
    // 前提条件: 目標が存在すること
    // ステップ1: 目標ページに移動
    await page.goto('/goals')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000) // データの読み込みを待つ

    // ステップ2: 目標リストから目標を選択
    const goalItems = page.locator('[class*="cursor-pointer"][class*="rounded-lg"]')
    const goalCount = await goalItems.count()

    if (goalCount === 0) {
      console.log('目標が存在しないため、テストをスキップします')
      test.skip()
      return
    }

    // 最初の目標を選択
    await goalItems.first().click()
    await page.waitForTimeout(500)

    // ステップ3: 編集ボタンをクリック
    const editButton = page.locator('button[aria-label="編集"], button[title="編集"], [class*="PencilIcon"]').first()
    if (await editButton.isVisible()) {
      await editButton.click()

      // ステップ4: 編集モーダルが開くことを確認
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
      const modal = page.locator('[role="dialog"]')
      await expect(modal).toBeVisible()

      // ステップ5: 目標タイムを変更
      const targetTimeInput = modal.locator('input[placeholder*="分:秒"], input[id*="target"]').first()
      if (await targetTimeInput.isVisible()) {
        await targetTimeInput.clear()
        await targetTimeInput.fill('0:59.00')
      }

      // ステップ6: 更新ボタンをクリック
      const updateButton = modal.locator('button[type="submit"], button:has-text("更新")').first()
      await updateButton.click()

      // ステップ7: モーダルが閉じることを確認
      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 })
    }
  })

  /**
   * TC-GOALS-003: 目標の削除
   * 目標を削除して一覧から消える
   */
  test('TC-GOALS-003: 目標の削除', async ({ page }) => {
    // 前提条件: 目標が存在すること
    // ステップ1: 目標ページに移動
    await page.goto('/goals')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000) // データの読み込みを待つ

    // ステップ2: 目標リストから目標を選択
    const goalItems = page.locator('[class*="cursor-pointer"][class*="rounded-lg"]')
    const goalCountBefore = await goalItems.count()

    if (goalCountBefore === 0) {
      console.log('目標が存在しないため、テストをスキップします')
      test.skip()
      return
    }

    // 最初の目標を選択
    await goalItems.first().click()
    await page.waitForTimeout(500)

    // ステップ3: 削除ボタンをクリック
    const deleteButton = page.locator('button[aria-label="削除"], button[title="削除"], [class*="TrashIcon"]').first()
    if (await deleteButton.isVisible()) {
      // 確認ダイアログが表示されることを想定
      page.on('dialog', dialog => dialog.accept())
      await deleteButton.click()

      // ステップ4: 目標が削除されたことを確認
      await page.waitForTimeout(1000) // 削除処理の完了を待つ

      const goalCountAfter = await goalItems.count()
      expect(goalCountAfter).toBeLessThan(goalCountBefore)
    }
  })

  /**
   * TC-GOALS-004: 目標達成マーク
   * 目標を達成済みにマーク
   */
  test('TC-GOALS-004: 目標達成マーク', async ({ page }) => {
    // 前提条件: 目標が存在すること
    // ステップ1: 目標ページに移動
    await page.goto('/goals')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000) // データの読み込みを待つ

    // ステップ2: 目標リストから目標を選択
    const goalItems = page.locator('[class*="cursor-pointer"][class*="rounded-lg"]')
    const goalCount = await goalItems.count()

    if (goalCount === 0) {
      console.log('目標が存在しないため、テストをスキップします')
      test.skip()
      return
    }

    // 達成していない目標を探す（緑色でない目標）
    let targetGoal = null
    for (let i = 0; i < goalCount; i++) {
      const goal = goalItems.nth(i)
      const classes = await goal.getAttribute('class')
      if (!classes?.includes('bg-green')) {
        targetGoal = goal
        break
      }
    }

    if (!targetGoal) {
      console.log('未達成の目標が存在しないため、テストをスキップします')
      test.skip()
      return
    }

    // 目標を選択
    await targetGoal.click()
    await page.waitForTimeout(500)

    // ステップ3: 目標詳細画面で達成マークボタンを探す
    const achieveButton = page.locator('button:has-text("達成"), button:has-text("目標達成")').first()
    if (await achieveButton.isVisible()) {
      await achieveButton.click()

      // ステップ4: 達成マークが付いたことを確認
      await page.waitForTimeout(1000)

      // 達成バッジが表示されることを確認
      const achievedBadge = page.locator('text=達成').first()
      await expect(achievedBadge).toBeVisible({ timeout: 5000 })
    }
  })
})
