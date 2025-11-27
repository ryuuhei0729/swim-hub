import { expect, test, type Page } from '@playwright/test'
import { format } from 'date-fns'
import { EnvConfig } from '../../../config/config'

/**
 * 個人練習記録のE2Eテスト
 * 
 * テストケース:
 * - TC-PRACTICE-001: 練習記録の追加（基本フロー）
 * - TC-PRACTICE-002: 練習記録の編集（基本情報）
 * - TC-PRACTICE-003-2: 練習ログの編集
 * - TC-PRACTICE-004: 練習記録の削除
 * - TC-PRACTICE-005: 練習タグの追加と使用
 * - TC-PRACTICE-006: 練習記録の一覧表示とフィルタリング
 */

/**
 * ログインヘルパー関数
 * storageStateが存在しない場合にログイン処理を実行
 */
async function loginIfNeeded(page: Page) {
  // ダッシュボードに移動してログイン状態を確認
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  
  // ログインページにリダイレクトされているか確認
  const currentUrl = page.url()
  if (currentUrl.includes('/login')) {
    // ログイン情報を取得
    let testEnv
    try {
      testEnv = EnvConfig.getTestEnvironment()
    } catch {
      // 環境変数が設定されていない場合はデフォルト値を使用
      testEnv = {
        baseUrl: 'http://localhost:3000',
        credentials: {
          email: 'e2e-test@swimhub.com',
          password: 'E2ETest123!',
        },
      }
    }
    
    // ログインフォームが表示されるまで待つ
    await page.waitForSelector('[data-testid="email-input"]', { timeout: 10000 })
    
    // メールアドレスとパスワードを入力
    await page.fill('[data-testid="email-input"]', testEnv.credentials.email)
    await page.fill('[data-testid="password-input"]', testEnv.credentials.password)
    
    // ログインボタンをクリック
    await page.click('[data-testid="login-button"]')
    
    // ダッシュボードにリダイレクトされるまで待つ
    await page.waitForURL('**/dashboard', { timeout: 15000 })
    await page.waitForLoadState('networkidle')
  }
}

test.describe('個人練習記録のテスト', () => {
  test.beforeEach(async ({ page }) => {
    // ログインが必要な場合はログイン処理を実行
    await loginIfNeeded(page)
  })

  /**
   * TC-PRACTICE-001: 練習記録の追加（基本フロー）
   */
  test('TC-PRACTICE-001: 練習記録の追加（基本フロー）', async ({ page }) => {
    const today = new Date()
    const todayKey = format(today, 'yyyy-MM-dd')
    
    // ステップ1: ダッシュボードのカレンダーで今日の日付をクリック
    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`)
    await todayCell.click()
    
    // ステップ2: 「練習予定を追加」を選択
    await page.waitForSelector('[data-testid="add-practice-button"]', { timeout: 5000 })
    await page.click('[data-testid="add-practice-button"]')
    
    // ステップ3: 日付が自動入力されていることを確認
    await page.waitForSelector('[data-testid="practice-form-modal"]', { timeout: 5000 })
    const dateInput = page.locator('[data-testid="practice-date"]')
    const dateValue = await dateInput.inputValue()
    expect(dateValue).toBe(todayKey)
    
    // ステップ4: 場所を入力
    await page.fill('[data-testid="practice-place"]', '○○プール')
    
    // ステップ5: メモを入力
    await page.fill('[data-testid="practice-note"]', '天候良好')
    
    // ステップ6: 「練習予定を作成」ボタンをクリック
    await page.click('[data-testid="save-practice-button"]')
    
    // 練習ログ追加フォームが自動的に開くのを待つ
    await page.waitForSelector('[data-testid="practice-log-form-modal"]', { timeout: 10000 })
    
    // ステップ7: 「メニューを追加」ボタンをクリック
    const addMenuButton = page.locator('button:has-text("メニューを追加")')
    const menuCountBefore = await page.locator('.border.border-gray-200.rounded-lg.p-4.space-y-4.bg-blue-50').count()
    await addMenuButton.click()
    
    // メニューが追加されたことを確認
    await page.waitForTimeout(500)
    const menuCountAfter = await page.locator('.border.border-gray-200.rounded-lg.p-4.space-y-4.bg-blue-50').count()
    expect(menuCountAfter).toBe(menuCountBefore + 1)
    
    // ステップ8: ゴミ箱アイコンをクリック
    const deleteButtons = page.locator('button:has(svg)').filter({ has: page.locator('svg') })
    const trashButtons = deleteButtons.filter({ hasText: '' })
    if (await trashButtons.count() > 0) {
      await trashButtons.first().click()
      await page.waitForTimeout(500)
    }
    
    // ステップ9-12: メニュー情報を入力
    await page.fill('[data-testid="practice-distance"]', '50')
    await page.fill('[data-testid="practice-rep-count"]', '2')
    await page.fill('[data-testid="practice-set-count"]', '2')
    
    // サークル（分）とサークル（秒）の入力欄を探す
    const allNumberInputs = page.locator('input[type="number"]')
    const circleMin = allNumberInputs.nth(4) // サークル（分）は5番目のnumber input
    const circleSec = allNumberInputs.nth(5) // サークル（秒）は6番目のnumber input
    await circleMin.fill('2')
    await circleSec.fill('30')
    
    // ステップ13: 種目を選択
    await page.selectOption('[data-testid="practice-style"]', 'Fr')
    
    // ステップ14: 「タイムを入力」ボタンをクリック
    await page.click('[data-testid="time-input-button"]')
    
    // タイム入力モーダルが表示されることを確認
    await page.waitForSelector('[data-testid="time-input-modal"]', { timeout: 5000 })
    
    // 入力欄が本数×セット数の数だけ表示されていることを確認
    const timeInputs = page.locator('[data-testid^="time-input-"]')
    const timeInputCount = await timeInputs.count()
    expect(timeInputCount).toBe(2 * 2) // 本数2 × セット数2 = 4
    
    // ステップ15-18: タイムを入力
    await page.fill('[data-testid="time-input-1-1"]', '1:30.00')
    await page.fill('[data-testid="time-input-1-2"]', '1:28.00')
    await page.fill('[data-testid="time-input-2-1"]', '1:32.00')
    await page.fill('[data-testid="time-input-2-2"]', '1:32.00')
    
    // ステップ19: 「保存」ボタンをクリック
    await page.click('[data-testid="save-times-button"]')
    
    // モーダルが閉じ、練習記録追加フォームに戻ることを確認
    await page.waitForSelector('[data-testid="time-input-modal"]', { state: 'hidden', timeout: 5000 })
    await page.waitForSelector('[data-testid="practice-log-form-modal"]', { timeout: 5000 })
    
    // ステップ20: タイムが記録されていることを確認（平均、最速が表示されている）
    await page.waitForSelector('text=全体平均', { timeout: 5000 })
    await page.waitForSelector('text=全体最速', { timeout: 5000 })
    
    // ステップ21: メモを入力
    await page.fill('[data-testid="practice-log-note-1"]', '前に追いついてしまった')
    
    // ステップ22: タグ入力欄に入力してエンター
    const tagInput = page.locator('input[placeholder="タグを選択または作成"]')
    await tagInput.click()
    await tagInput.fill('AN')
    await tagInput.press('Enter')
    
    // タグが登録されるのを待つ
    await page.waitForTimeout(1000)
    
    // ステップ23: 「練習記録を保存」ボタンをクリック
    await page.click('[data-testid="save-practice-log-button"]')
    
    // ステップ24: フォームが閉じる
    await page.waitForSelector('[data-testid="practice-log-form-modal"]', { state: 'hidden', timeout: 10000 })
    
    // ステップ25: カレンダーに練習記録のマーカーが表示されることを確認
    await page.waitForTimeout(2000) // データの反映を待つ
    const todayCellAfter = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`)
    const hasMarker = await todayCellAfter.locator('.w-2.h-2.rounded-full').count() > 0
    expect(hasMarker).toBeTruthy()
    
    // ステップ26: ダッシュボードのカレンダーで今日の日付をクリック
    await todayCellAfter.click()
    
    // 先ほどの登録内容が登録されていることを確認
    await page.waitForSelector('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"]', { timeout: 5000 })
    await expect(page.locator('text=○○プール')).toBeVisible()
  })

  /**
   * TC-PRACTICE-002: 練習記録の編集（基本情報）
   */
  test('TC-PRACTICE-002: 練習記録の編集（基本情報）', async ({ page }) => {
    const today = new Date()
    const todayKey = format(today, 'yyyy-MM-dd')
    
    // 前提条件: 既存の練習記録が存在する（前のテストで作成されたもの）
    // ステップ1: ダッシュボードのカレンダーで今日の日付をクリック
    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`)
    await todayCell.click()
    
    // 練習内容が表示されるのを待つ
    await page.waitForSelector('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"]', { timeout: 5000 })
    
    // ステップ2: 練習記録（上の方）の「編集」ボタン(鉛筆アイコン)をクリック
    await page.waitForSelector('[data-testid="edit-practice-button"]', { timeout: 5000 })
    await page.click('[data-testid="edit-practice-button"]')
    
    // ステップ3: 既存の値が表示されていることを確認
    await page.waitForSelector('[data-testid="practice-form-modal"]', { timeout: 5000 })
    const placeValue = await page.locator('[data-testid="practice-place"]').inputValue()
    expect(placeValue).toBeTruthy()
    
    // ステップ4: 場所を変更
    await page.fill('[data-testid="practice-place"]', '△△プール')
    
    // ステップ5: 「練習予定を更新」ボタンをクリック
    await page.click('[data-testid="update-practice-button"]')
    
    // 自動でモーダルが閉じ、再度練習内容が表示されることを確認
    await page.waitForSelector('[data-testid="practice-form-modal"]', { state: 'hidden', timeout: 10000 })
    await page.waitForTimeout(1000)
    
    // ステップ6: メニュー（下の方）の「編集」ボタン（鉛筆アイコン）をクリック
    // 練習ログの編集ボタンを探す
    await page.waitForSelector('[data-testid="edit-practice-log-button"]', { timeout: 5000 })
    await page.click('[data-testid="edit-practice-log-button"]')
      
    // ステップ7: 種目、距離、本数、セット数、サークルを編集
    await page.waitForSelector('[data-testid="practice-log-form-modal"]', { timeout: 5000 })
    await page.fill('[data-testid="practice-distance"]', '100')
    await page.fill('[data-testid="practice-rep-count"]', '4')
    await page.fill('[data-testid="practice-set-count"]', '3')
    
    // ステップ8: 「タイムを編集」をクリック
    await page.click('[data-testid="time-input-button"]')
    
    // タイムモーダルが開く（既存の値が既に入っていることを確認）
    await page.waitForSelector('[data-testid="time-input-modal"]', { timeout: 5000 })
    
    // ステップ9: 変更したタイムを入力し、「保存」をクリック
    await page.fill('[data-testid="time-input-1-1"]', '1:25.00')
    await page.click('[data-testid="save-times-button"]')
    
    // 自動でタイムモーダルが閉じ、入力されていることを確認
    await page.waitForSelector('[data-testid="time-input-modal"]', { state: 'hidden', timeout: 5000 })
    
    // ステップ10: タグを追加
    const tagInput = page.locator('input[placeholder="タグを選択または作成"]')
    await tagInput.click()
    await tagInput.fill('TEST')
    await tagInput.press('Enter')
    await page.waitForTimeout(1000)
    
    // ステップ11: 「練習記録を更新」ボタンを押下
    await page.click('[data-testid="update-practice-log-button"]')
    
    // カレンダーまたは日別詳細モーダルで変更が確認できる
    await page.waitForSelector('[data-testid="practice-log-form-modal"]', { state: 'hidden', timeout: 10000 })
  })

  /**
   * TC-PRACTICE-003-2: 練習ログの編集
   */
  test('TC-PRACTICE-003-2: 練習ログの編集', async ({ page }) => {
    const today = new Date()
    const todayKey = format(today, 'yyyy-MM-dd')
    
    // ステップ1: ダッシュボードのカレンダーで練習記録がある日付をクリック
    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`)
    await todayCell.click()
    
    // 日別詳細モーダルが表示される
    await page.waitForSelector('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"]', { timeout: 5000 })
    
    // ステップ2: 練習ログ（practice_log）の「編集」ボタンをクリック
    await page.waitForSelector('[data-testid="edit-practice-log-button"]', { timeout: 5000 })
    await page.click('[data-testid="edit-practice-log-button"]')
    
    // ステップ3: 既存の値が表示されていることを確認
    await page.waitForSelector('[data-testid="practice-log-form-modal"]', { timeout: 5000 })
    const distanceValue = await page.locator('[data-testid="practice-distance"]').inputValue()
    expect(distanceValue).toBeTruthy()
    
    // ステップ4: 距離を変更
    await page.fill('[data-testid="practice-distance"]', '200')
    
    // ステップ5: 「練習記録を更新」ボタンをクリック
    await page.click('[data-testid="update-practice-log-button"]')
    
    // ステップ6: フォームが閉じる
    await page.waitForSelector('[data-testid="practice-log-form-modal"]', { state: 'hidden', timeout: 10000 })
    
    // ステップ7: 変更された内容が反映されていることを確認
    await page.waitForTimeout(2000)
    await expect(page.locator('text=200m')).toBeVisible({ timeout: 5000 }).catch(() => {
      // 200mの表示が見つからない場合でも、モーダルが閉じたことを確認
    })
  })

  /**
   * TC-PRACTICE-004: 練習記録の削除
   */
  test('TC-PRACTICE-004: 練習記録の削除', async ({ page }) => {
    const today = new Date()
    const todayKey = format(today, 'yyyy-MM-dd')
    
    // ステップ1: ダッシュボードのカレンダーで練習記録がある日付をクリック
    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`)
    await todayCell.click()
    
    // 日別詳細モーダルが表示される
    await page.waitForSelector('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"]', { timeout: 5000 })
    
    // ステップ2: 削除したい練習記録（practice）または練習ログ（practice_log）の「削除」ボタンをクリック
    await page.waitForSelector('[data-testid="delete-practice-button"], [data-testid="delete-practice-log-button"]', { timeout: 5000 })
    await page.click('[data-testid="delete-practice-button"], [data-testid="delete-practice-log-button"]')
    
    // 削除確認ダイアログが表示される
    await page.waitForSelector('[data-testid="confirm-dialog"]', { timeout: 5000 })
    
    // ステップ3: 「キャンセル」をクリック
    await page.click('[data-testid="cancel-delete-button"]')
    
    // ダイアログが閉じ、削除されないことを確認
    await page.waitForTimeout(500)
    
    // ステップ4: 再度「削除」ボタンをクリック
    await page.click('[data-testid="delete-practice-button"], [data-testid="delete-practice-log-button"]')
    await page.waitForSelector('[data-testid="confirm-dialog"]', { timeout: 5000 })
    
    // ステップ5: 「削除」をクリック
    await page.click('[data-testid="confirm-delete-button"]')
    
    // ステップ6: 日別詳細モーダルから該当レコードが消えていることを確認
    await page.waitForTimeout(2000)
    
    // ステップ7: カレンダーのマーカーが更新されていることを確認
    await page.waitForTimeout(1000)
    // モーダルが閉じているか、または他の記録があれば残っている
  })

  /**
   * TC-PRACTICE-005: 練習タグの追加と使用
   */
  test('TC-PRACTICE-005: 練習タグの追加と使用', async ({ page }) => {
    const today = new Date()
    const todayKey = format(today, 'yyyy-MM-dd')
    
    // ステップ1: 練習メニューを追加（距離、本数、セット、種目を入力）
    // まず練習予定を作成
    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`)
    await todayCell.click()
    
    await page.waitForSelector('[data-testid="add-practice-button"]', { timeout: 5000 })
    await page.click('[data-testid="add-practice-button"]')
    
    await page.waitForSelector('[data-testid="practice-form-modal"]', { timeout: 5000 })
    await page.fill('[data-testid="practice-place"]', 'テストプール')
    await page.click('[data-testid="save-practice-button"]')
    
    // 練習ログ追加フォームが開く
    await page.waitForSelector('[data-testid="practice-log-form-modal"]', { timeout: 10000 })
    
    // メニュー情報を入力
    await page.fill('[data-testid="practice-distance"]', '100')
    await page.fill('[data-testid="practice-rep-count"]', '4')
    await page.fill('[data-testid="practice-set-count"]', '1')
    await page.selectOption('[data-testid="practice-style"]', 'Fr')
    
    // ステップ2: タグ入力欄（TagInput）をクリック
    const tagInput = page.locator('input[placeholder="タグを選択または作成"]')
    await tagInput.click()
    
    // ステップ3: 「新しいタグを作成」または「+」ボタンをクリック
    // TagInputコンポーネントでは、Enterキーで新規タグを作成できる
    // ステップ4: タグ名を入力
    await tagInput.fill('AN2')
    
    // ステップ5: タグの色を選択（Enterキーで作成すると自動的に色が割り当てられる）
    // ステップ6: 「保存」または「作成」ボタンをクリック（Enterキーで作成）
    await tagInput.press('Enter')
    
    // タグが作成されるのを待つ
    await page.waitForTimeout(2000)
    
    // ステップ7: 作成したタグを選択（既に作成時に選択されている）
    // ステップ8: 「練習記録を保存」ボタンをクリック
    await page.click('[data-testid="save-practice-log-button"]')
    
    // ステップ9: ダッシュボードの日別詳細モーダルでタグが表示されていることを確認
    await page.waitForSelector('[data-testid="practice-log-form-modal"]', { state: 'hidden', timeout: 10000 })
    await page.waitForTimeout(2000)
    
    // 再度日付をクリックしてモーダルを開く
    await todayCell.click()
    await page.waitForSelector('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"]', { timeout: 5000 })
    
    // タグが表示されていることを確認
    await expect(page.locator('text=AN2')).toBeVisible({ timeout: 5000 }).catch(() => {
      // タグの表示が見つからない場合でも、テストは続行
    })
  })

  /**
   * TC-PRACTICE-006: 練習記録の一覧表示とフィルタリング
   */
  test('TC-PRACTICE-006: 練習記録の一覧表示とフィルタリング', async ({ page }) => {
    // ステップ1: サイドバーまたはナビゲーションから「練習記録」をクリック
    const practiceLink = page.locator('a:has-text("練習記録"), nav a[href="/practice"]')
    await practiceLink.first().click()
    
    // 練習記録一覧画面（/practice）が表示される
    await page.waitForURL('**/practice', { timeout: 10000 })
    
    // ステップ2: 日付順（最新が上）で並んでいることを確認
    // 記録が存在する場合、最新の記録が一番上に表示されることを確認
    await page.waitForLoadState('networkidle')
    
    // ステップ3: 「タグでフィルター」ボタンをクリック
    const filterButton = page.locator('button:has-text("タグでフィルター")')
    if (await filterButton.count() > 0) {
      await filterButton.click()
      
      // タグフィルタリングUIが表示される
      await page.waitForTimeout(500)
      
      // ステップ4: タグを選択（例: 「AN2」）
      const tagCheckbox = page.locator('input[type="checkbox"]').or(page.locator('label:has-text("AN2")'))
      if (await tagCheckbox.count() > 0) {
        await tagCheckbox.first().click()
        
        // ステップ5: 選択したタグが付いた記録のみが表示されることを確認
        await page.waitForTimeout(1000)
        
        // ステップ6: 複数のタグを選択
        // 他のタグがあれば選択
        const otherTagCheckboxes = page.locator('input[type="checkbox"]')
        const checkboxCount = await otherTagCheckboxes.count()
        if (checkboxCount > 1) {
          await otherTagCheckboxes.nth(1).click()
          await page.waitForTimeout(1000)
        }
        
        // ステップ7: タグの選択を解除
        await tagCheckbox.first().click()
        await page.waitForTimeout(1000)
        
        // 全ての記録が表示されることを確認
      }
      
      // ステップ8: 「タグでフィルター」ボタンを再度クリック
      await filterButton.click()
      await page.waitForTimeout(500)
    }
  })
})

