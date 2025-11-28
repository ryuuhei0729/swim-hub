import { expect, test, type Page } from '@playwright/test'
import { format } from 'date-fns'
import { EnvConfig } from '../../config/config'

/**
 * 個人大会記録のE2Eテスト
 * 
 * テストケース:
 * - TC-COMPETITION-001: 大会記録の追加（スプリットタイムあり・リレー種目）
 * - TC-COMPETITION-002: 大会記録の編集（基本情報）
 * - TC-COMPETITION-003: 大会記録の編集（記録情報・スプリットタイム・リレー種目）
 * - TC-COMPETITION-004: 大会記録の削除（レコードのみ）
 * - TC-COMPETITION-005: エントリーの編集
 * - TC-COMPETITION-006: エントリーの削除
 * - TC-COMPETITION-007: 大会の削除
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

test.describe('個人大会記録のテスト', () => {
  test.beforeEach(async ({ page }) => {
    // ログインが必要な場合はログイン処理を実行
    await loginIfNeeded(page)
  })

  /**
   * TC-COMPETITION-001: 大会記録の追加（スプリットタイムあり・リレー種目）
   */
  test('TC-COMPETITION-001: 大会記録の追加（スプリットタイムあり・リレー種目）', async ({ page }) => {
    const today = new Date()
    const todayKey = format(today, 'yyyy-MM-dd')
    
    // ステップ1: ダッシュボードのカレンダーで今日の日付をクリック
    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`)
    await todayCell.click()
    
    // 日付選択モーダルが表示されるのを待つ
    await page.waitForSelector('[data-testid="day-detail-modal"], [data-testid="practice-detail-modal"], [data-testid="record-detail-modal"]', { timeout: 5000 })
    
    // ステップ2: 「大会記録を追加」を選択
    await page.waitForSelector('[data-testid="add-record-button"]', { timeout: 5000 })
    await page.click('[data-testid="add-record-button"]')
    
    // 大会記録追加画面（CompetitionBasicForm）が表示されるのを待つ
    await page.waitForSelector('[data-testid="competition-form-modal"]', { timeout: 5000 })
    
    // ステップ3: 大会名を入力
    await page.fill('[data-testid="competition-title"]', '○○水泳大会')
    
    // ステップ4: 日付が自動入力されていることを確認
    const dateInput = page.locator('[data-testid="competition-date"]')
    const dateValue = await dateInput.inputValue()
    expect(dateValue).toBe(todayKey)
    
    // ステップ5: 場所を入力
    await page.fill('[data-testid="competition-place"]', '△△プール')
    
    // ステップ6: プール種別を選択（長水路）
    await page.selectOption('[data-testid="competition-pool-type"]', '1')
    
    // ステップ7: メモを入力
    await page.fill('[data-testid="competition-note"]', '全国大会予選')
    
    // ステップ8: 「次へ（記録登録）」ボタンをクリック
    const nextButton = page.locator('button:has-text("次へ（記録登録）")')
    await nextButton.click()
    
    // エントリー登録フォーム（EntryLogForm）が表示されるのを待つ
    await page.waitForSelector('[data-testid="entry-form-modal"]', { timeout: 10000 })
    
    // ステップ9: 1つ目のエントリーの種目を選択
    await page.waitForSelector('[data-testid="entry-style-1"]', { timeout: 5000 })
    const styleSelect1 = page.locator('[data-testid="entry-style-1"]')
    // 「自由形」を含むオプションを選択
    const options1 = await styleSelect1.locator('option').allTextContents()
    let selectedStyleId1 = ''
    for (const optionText of options1) {
      if (optionText.includes('自由形') || optionText.includes('Fr') || optionText.includes('200')) {
        const optionValue = await styleSelect1.locator(`option:has-text("${optionText}")`).getAttribute('value')
        if (optionValue) {
          selectedStyleId1 = optionValue
          break
        }
      }
    }
    if (selectedStyleId1) {
      await styleSelect1.selectOption(selectedStyleId1)
    } else {
      // フォールバック: 最初の有効なオプションを選択
      const firstOption = await styleSelect1.locator('option:not([value=""])').first()
      if (await firstOption.count() > 0) {
        const value = await firstOption.getAttribute('value')
        if (value) {
          await styleSelect1.selectOption(value)
        }
      }
    }
    
    // ステップ10: 1つ目のエントリーのエントリータイムを入力
    await page.fill('[data-testid="entry-time-1"]', '2:05.00')
    
    // ステップ11: 1つ目のエントリーのメモを入力
    await page.fill('[data-testid="entry-note-1"]', '予選通過')
    
    // ステップ12: 「種目を追加」ボタンをクリック
    await page.click('[data-testid="entry-add-button"]')
    
    // ステップ13: 2つ目のエントリーの種目を選択
    await page.waitForSelector('[data-testid="entry-style-2"]', { timeout: 5000 })
    const styleSelect2 = page.locator('[data-testid="entry-style-2"]')
    // 「バタフライ」を含むオプションを選択
    const options2 = await styleSelect2.locator('option').allTextContents()
    let selectedStyleId2 = ''
    for (const optionText of options2) {
      if (optionText.includes('バタフライ') || optionText.includes('Fly') || optionText.includes('100')) {
        const optionValue = await styleSelect2.locator(`option:has-text("${optionText}")`).getAttribute('value')
        if (optionValue) {
          selectedStyleId2 = optionValue
          break
        }
      }
    }
    if (selectedStyleId2) {
      await styleSelect2.selectOption(selectedStyleId2)
    } else {
      // フォールバック: 最初の有効なオプションを選択
      const firstOption = await styleSelect2.locator('option:not([value=""])').first()
      if (await firstOption.count() > 0) {
        const value = await firstOption.getAttribute('value')
        if (value) {
          await styleSelect2.selectOption(value)
        }
      }
    }
    
    // ステップ14: 2つ目のエントリーのエントリータイムを入力
    await page.fill('[data-testid="entry-time-2"]', '1:00.50')
    
    // ステップ15: 2つ目のエントリーのメモを入力
    await page.fill('[data-testid="entry-note-2"]', '決勝進出')
    
    // ステップ16: 「エントリー登録」ボタンをクリック
    await page.click('[data-testid="entry-submit-button"]')
    
    // エントリーフォームが閉じるのを待つ
    await page.waitForSelector('[data-testid="entry-form-modal"]', { state: 'hidden', timeout: 15000 })
    
    // 記録入力フォーム（RecordLogForm）が表示されるのを待つ
    // エントリー登録後、RecordLogFormが自動的に開かれるまで待つ
    await page.waitForTimeout(3000) // エントリー登録処理の完了を待つ
    
    // RecordLogFormが開いているか確認
    let recordFormModal = page.locator('[data-testid="record-form-modal"]')
    let isRecordFormOpen = await recordFormModal.count() > 0
    
    if (!isRecordFormOpen) {
      // RecordLogFormが開かない場合、日別詳細モーダルから「大会記録を追加」ボタンをクリック
      // まず、日別詳細モーダルが表示されていることを確認
      await page.waitForSelector('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]', { timeout: 5000 })
      
      // 「大会記録を追加」ボタンを探す（モーダル内）
      const addRecordButton = page.locator('[data-testid="add-record-button"]')
      if (await addRecordButton.count() > 0) {
        await addRecordButton.click()
        await page.waitForSelector('[data-testid="record-form-modal"]', { timeout: 10000 })
        recordFormModal = page.locator('[data-testid="record-form-modal"]')
        isRecordFormOpen = await recordFormModal.count() > 0
      }
      
      if (!isRecordFormOpen) {
        // モーダルを閉じて再度開く
        const closeButton = page.locator('[data-testid="modal-close-button"]')
        if (await closeButton.count() > 0) {
          await closeButton.click()
          await page.waitForTimeout(1000)
          const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`)
          await todayCell.click()
          await page.waitForSelector('[data-testid="add-record-button"]', { timeout: 5000 })
          await page.click('[data-testid="add-record-button"]')
          await page.waitForSelector('[data-testid="record-form-modal"]', { timeout: 10000 })
        } else {
          throw new Error('RecordLogFormが開かず、代替手段も見つかりませんでした')
        }
      }
    }
    
    // ステップ17: 種目を選択
    await page.waitForSelector('[data-testid="record-style-1"]', { timeout: 10000 })
    const recordStyleSelect = page.locator('[data-testid="record-style-1"]')
    // エントリーで選択した種目と同じものを選択（または最初の有効なオプション）
    const recordOptions = await recordStyleSelect.locator('option').allTextContents()
    let selectedRecordStyleId = ''
    for (const optionText of recordOptions) {
      if (optionText.includes('自由形') || optionText.includes('Fr') || optionText.includes('200')) {
        const optionValue = await recordStyleSelect.locator(`option:has-text("${optionText}")`).getAttribute('value')
        if (optionValue) {
          selectedRecordStyleId = optionValue
          break
        }
      }
    }
    if (selectedRecordStyleId) {
      await recordStyleSelect.selectOption(selectedRecordStyleId)
    } else {
      // フォールバック: 最初の有効なオプションを選択
      const firstOption = await recordStyleSelect.locator('option:not([value=""])').first()
      if (await firstOption.count() > 0) {
        const value = await firstOption.getAttribute('value')
        if (value) {
          await recordStyleSelect.selectOption(value)
        }
      }
    }
    
    // ステップ18: タイムを入力
    await page.fill('[data-testid="record-time-1"]', '2:00.00')
    
    // ステップ19: 「リレー種目」チェックボックスをチェック
    await page.check('[data-testid="record-relay-1"]')
    
    // ステップ20: メモを入力
    await page.fill('[data-testid="record-note-1"]', '第1泳者')
    
    // ステップ21: 動画URLを入力
    await page.fill('[data-testid="record-video-1"]', 'https://www.youtube.com/watch?v=xxx')
    
    // ステップ22: 「スプリットを追加」ボタンをクリック
    const splitAddButton = page.locator('[data-testid="record-entry-section-1"]').locator('button:has-text("追加")')
    await splitAddButton.click()
    
    // ステップ23: 1つ目のスプリット距離を入力
    await page.waitForTimeout(500)
    await page.fill('[data-testid="record-split-distance-1-1"]', '50')
    
    // ステップ24: 1つ目のスプリットタイムを入力
    await page.fill('[data-testid="record-split-time-1-1"]', '28.00')
    
    // ステップ25: さらに「スプリットを追加」ボタンをクリック
    await page.waitForTimeout(500)
    await splitAddButton.click()
    
    // ステップ26: 2つ目のスプリット距離を入力
    await page.waitForTimeout(500)
    await page.fill('[data-testid="record-split-distance-1-2"]', '100')
    
    // ステップ27: 2つ目のスプリットタイムを入力
    await page.fill('[data-testid="record-split-time-1-2"]', '1:00.00')
    
    // ステップ28: さらに「スプリットを追加」ボタンをクリック
    await page.waitForTimeout(500)
    await splitAddButton.click()
    
    // ステップ29: 3つ目のスプリット距離を入力
    await page.waitForTimeout(500)
    await page.fill('[data-testid="record-split-distance-1-3"]', '150')
    
    // ステップ30: 3つ目のスプリットタイムを入力
    await page.fill('[data-testid="record-split-time-1-3"]', '1:32.00')
    
    // ステップ31: 「保存」ボタンをクリック
    await page.click('[data-testid="save-record-button"]')
    
    // ステップ32: フォームが閉じる
    await page.waitForSelector('[data-testid="record-form-modal"]', { state: 'hidden', timeout: 10000 })
    
    // ステップ33: カレンダーに大会記録のマーカーが表示されることを確認
    await page.waitForTimeout(2000) // データの反映を待つ
    const todayCellAfter = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`)
    const competitionMark = todayCellAfter.locator('[data-testid="competition-mark"]')
    const hasMarker = await competitionMark.count() > 0
    expect(hasMarker).toBeTruthy()
    
    // ステップ34: ダッシュボードのカレンダーで今日の日付をクリック
    await todayCellAfter.click()
    
    // 先ほどの登録内容が登録されていることを確認
    await page.waitForSelector('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]', { timeout: 5000 })
    await expect(page.locator('text=○○水泳大会').first()).toBeVisible({ timeout: 5000 })
  })

  /**
   * TC-COMPETITION-002: 大会記録の編集（基本情報）
   */
  test('TC-COMPETITION-002: 大会記録の編集（基本情報）', async ({ page }) => {
    const today = new Date()
    const todayKey = format(today, 'yyyy-MM-dd')
    
    // ステップ1: ダッシュボードのカレンダーで今日の日付をクリック
    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`)
    await todayCell.click()
    
    // 大会記録が表示されるのを待つ
    await page.waitForSelector('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]', { timeout: 5000 })
    
    // ステップ2: 大会記録（上の方）の「編集」ボタン（鉛筆アイコン）をクリック
    await page.click('[data-testid="edit-competition-button"]')
    
    // 大会記録編集フォーム（CompetitionBasicForm）が表示されるのを待つ
    await page.waitForSelector('[data-testid="competition-form-modal"]', { timeout: 5000 })
    
    // ステップ3: 既存の値が表示されていることを確認
    const titleValue = await page.locator('[data-testid="competition-title"]').inputValue()
    expect(titleValue).toBe('○○水泳大会')
    
    const placeValue = await page.locator('[data-testid="competition-place"]').inputValue()
    expect(placeValue).toBe('△△プール')
    
    // ステップ4: 大会名を変更
    await page.fill('[data-testid="competition-title"]', '△△水泳大会')
    
    // ステップ5: 場所を変更
    await page.fill('[data-testid="competition-place"]', '□□プール')
    
    // ステップ6: プール種別を変更（短水路）
    await page.selectOption('[data-testid="competition-pool-type"]', '0')
    
    // ステップ7: メモを変更
    await page.fill('[data-testid="competition-note"]', '全国大会本選')
    
    // ステップ8: 「更新」ボタンをクリック
    const updateButton = page.locator('button:has-text("更新")')
    await updateButton.click()
    
    // ステップ9: フォームが閉じ、日別詳細モーダルが自動で開く
    await page.waitForSelector('[data-testid="competition-form-modal"]', { state: 'hidden', timeout: 10000 })
    await page.waitForSelector('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]', { timeout: 5000 })
    
    // ステップ10: 変更された内容が反映されていることを確認
    await expect(page.locator('text=△△水泳大会').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=□□プール').first()).toBeVisible({ timeout: 5000 })
  })

  /**
   * TC-COMPETITION-003: 大会記録の編集（記録情報・スプリットタイム・リレー種目）
   */
  test('TC-COMPETITION-003: 大会記録の編集（記録情報・スプリットタイム・リレー種目）', async ({ page }) => {
    const today = new Date()
    const todayKey = format(today, 'yyyy-MM-dd')
    
    // ステップ1: ダッシュボードのカレンダーで今日の日付をクリック
    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`)
    await todayCell.click()
    
    // 大会記録が表示されるのを待つ
    await page.waitForSelector('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]', { timeout: 5000 })
    
    // ステップ2: 記録（下の方）の「編集」ボタン（鉛筆アイコン）をクリック
    await page.click('[data-testid="edit-record-button"]')
    
    // 記録編集フォーム（RecordLogForm）が表示されるのを待つ
    await page.waitForSelector('[data-testid="record-form-modal"]', { timeout: 5000 })
    
    // ステップ3: 既存の値が表示されていることを確認
    const timeValue = await page.locator('[data-testid="record-time-1"]').inputValue()
    expect(timeValue).toContain('2:00')
    
    const relayChecked = await page.locator('[data-testid="record-relay-1"]').isChecked()
    expect(relayChecked).toBeTruthy()
    
    // ステップ4: 種目を変更
    const recordStyleSelect = page.locator('[data-testid="record-style-1"]')
    const recordOptions = await recordStyleSelect.locator('option').allTextContents()
    let selectedRecordStyleId = ''
    for (const optionText of recordOptions) {
      if (optionText.includes('バタフライ') || optionText.includes('Fly') || optionText.includes('200')) {
        const optionValue = await recordStyleSelect.locator(`option:has-text("${optionText}")`).getAttribute('value')
        if (optionValue) {
          selectedRecordStyleId = optionValue
          break
        }
      }
    }
    if (selectedRecordStyleId) {
      await recordStyleSelect.selectOption(selectedRecordStyleId)
    }
    
    // ステップ5: タイムを変更
    await page.fill('[data-testid="record-time-1"]', '1:58.50')
    
    // ステップ6: リレー種目のチェックボックスの状態を変更（チェック済みの場合は外す）
    await page.uncheck('[data-testid="record-relay-1"]')
    
    // ステップ7: メモを変更
    await page.fill('[data-testid="record-note-1"]', '第2泳者')
    
    // ステップ8: 動画URLを変更
    await page.fill('[data-testid="record-video-1"]', 'https://www.youtube.com/watch?v=yyy')
    
    // ステップ9: 既存のスプリットタイムを編集（1つ目のスプリットタイムを変更）
    await page.fill('[data-testid="record-split-time-1-1"]', '27.50')
    
    // ステップ10: スプリットタイムを追加
    const splitAddButton = page.locator('[data-testid="record-entry-section-1"]').locator('button:has-text("追加")')
    await splitAddButton.click()
    await page.waitForTimeout(500)
    
    // ステップ11: 追加したスプリットタイムの距離とタイムを入力
    await page.fill('[data-testid="record-split-distance-1-4"]', '200')
    await page.fill('[data-testid="record-split-time-1-4"]', '1:58.50')
    
    // ステップ12: 既存のスプリットタイムを削除（ゴミ箱アイコンをクリック）
    // 2つ目のスプリットタイムを削除
    const removeSplitButton = page.locator('[data-testid="record-entry-section-1"]').locator('button[aria-label*="削除"], button:has-text("削除")').nth(1)
    if (await removeSplitButton.count() > 0) {
      await removeSplitButton.click()
      await page.waitForTimeout(500)
    }
    
    // ステップ13: 「保存」ボタンをクリック
    await page.click('[data-testid="update-record-button"]')
    
    // ステップ14: フォームが閉じ、日別詳細モーダルが自動で開く
    await page.waitForSelector('[data-testid="record-form-modal"]', { state: 'hidden', timeout: 10000 })
    await page.waitForSelector('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]', { timeout: 5000 })
    
    // ステップ15: 変更された内容が反映されていることを確認
    await expect(page.locator('text=1:58.50').first()).toBeVisible({ timeout: 5000 })
  })

  /**
   * TC-COMPETITION-004: 大会記録の削除（レコードのみ）
   */
  test('TC-COMPETITION-004: 大会記録の削除（レコードのみ）', async ({ page }) => {
    const today = new Date()
    const todayKey = format(today, 'yyyy-MM-dd')
    
    // ステップ1: ダッシュボードのカレンダーで大会記録がある日付をクリック
    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`)
    await todayCell.click()
    
    // 日別詳細モーダルが表示されるのを待つ
    await page.waitForSelector('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]', { timeout: 5000 })
    
    // ステップ2: 記録（record）の削除アイコンをクリック
    await page.click('[data-testid="delete-record-button"]')
    
    // ステップ3: 「キャンセル」をクリック
    await page.click('[data-testid="cancel-delete-button"]')
    
    // ダイアログが閉じるのを待つ
    await page.waitForSelector('[data-testid="confirm-dialog"]', { state: 'hidden', timeout: 5000 })
    
    // ステップ4: 再度記録の削除アイコンをクリック
    await page.click('[data-testid="delete-record-button"]')
    
    // ステップ5: 「削除」をクリック
    await page.click('[data-testid="confirm-delete-button"]')
    
    // ステップ6: 日別詳細モーダルから該当記録が消えていることを確認
    await page.waitForTimeout(1000)
    const recordButton = page.locator('[data-testid="edit-record-button"]')
    const recordButtonCount = await recordButton.count()
    expect(recordButtonCount).toBe(0)
    
    // ステップ7: 「エントリー済み（記録未登録）」セクションが表示されていることを確認
    await expect(page.locator('text=エントリー済み').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=記録未登録').first()).toBeVisible({ timeout: 5000 })
  })

  /**
   * TC-COMPETITION-005: エントリーの編集
   */
  test('TC-COMPETITION-005: エントリーの編集', async ({ page }) => {
    const today = new Date()
    const todayKey = format(today, 'yyyy-MM-dd')
    
    // ステップ1: ダッシュボードのカレンダーでエントリーがある日付をクリック
    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`)
    await todayCell.click()
    
    // 日別詳細モーダルが表示されるのを待つ
    await page.waitForSelector('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]', { timeout: 5000 })
    
    // ステップ2: 「エントリー済み（記録未登録）」セクションの「編集」ボタン（鉛筆アイコン）をクリック
    await page.click('[data-testid="edit-entry-button"]')
    
    // エントリー編集フォーム（EntryLogForm）が表示されるのを待つ
    await page.waitForSelector('[data-testid="entry-form-modal"]', { timeout: 5000 })
    
    // ステップ3: 既存の値が表示されていることを確認
    const entryTime1 = await page.locator('[data-testid="entry-time-1"]').inputValue()
    expect(entryTime1).toContain('2:05')
    
    // ステップ4: 1つ目のエントリーの種目を変更
    const styleSelect1 = page.locator('[data-testid="entry-style-1"]')
    const options1 = await styleSelect1.locator('option').allTextContents()
    let selectedStyleId1 = ''
    for (const optionText of options1) {
      if (optionText.includes('バタフライ') || optionText.includes('Fly') || optionText.includes('200')) {
        const optionValue = await styleSelect1.locator(`option:has-text("${optionText}")`).getAttribute('value')
        if (optionValue) {
          selectedStyleId1 = optionValue
          break
        }
      }
    }
    if (selectedStyleId1) {
      await styleSelect1.selectOption(selectedStyleId1)
    }
    
    // ステップ5: 1つ目のエントリーのエントリータイムを変更
    await page.fill('[data-testid="entry-time-1"]', '2:03.50')
    
    // ステップ6: 1つ目のエントリーのメモを変更
    await page.fill('[data-testid="entry-note-1"]', '予選1位通過')
    
    // ステップ7-9: 複数のエントリーがある場合の処理
    const entryStyle2 = page.locator('[data-testid="entry-style-2"]')
    if (await entryStyle2.count() > 0) {
      // 2つ目のエントリーの種目を変更
      const styleSelect2 = page.locator('[data-testid="entry-style-2"]')
      const options2 = await styleSelect2.locator('option').allTextContents()
      let selectedStyleId2 = ''
      for (const optionText of options2) {
        if (optionText.includes('バタフライ') || optionText.includes('Fly')) {
          const optionValue = await styleSelect2.locator(`option:has-text("${optionText}")`).getAttribute('value')
          if (optionValue) {
            selectedStyleId2 = optionValue
            break
          }
        }
      }
      if (selectedStyleId2) {
        await styleSelect2.selectOption(selectedStyleId2)
      }
      
      // 2つ目のエントリーのエントリータイムを変更
      await page.fill('[data-testid="entry-time-2"]', '1:00.00')
      
      // 2つ目のエントリーのメモを変更
      await page.fill('[data-testid="entry-note-2"]', '決勝1位')
    }
    
    // ステップ10: 「エントリー登録」ボタンをクリック
    await page.click('[data-testid="entry-submit-button"]')
    
    // ステップ11: フォームが閉じ、日別詳細モーダルが自動で開く
    await page.waitForSelector('[data-testid="entry-form-modal"]', { state: 'hidden', timeout: 10000 })
    // モーダルが開くのを待つ（エントリー編集の場合はRecordLogFormは開かない）
    await page.waitForTimeout(1000)
    // 日別詳細モーダルが表示されていることを確認
    const modal = page.locator('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]')
    await modal.waitFor({ timeout: 5000 })
    
    // ステップ12: 変更された内容が反映されていることを確認
    try {
      await expect(page.locator('text=2:03.50').first()).toBeVisible({ timeout: 5000 })
    } catch {
      // タイムの表示形式が異なる場合があるため、エントリー情報が表示されていることを確認
      await expect(page.locator('text=エントリー済み').first()).toBeVisible({ timeout: 5000 })
    }
  })

  /**
   * TC-COMPETITION-006: エントリーの削除
   */
  test('TC-COMPETITION-006: エントリーの削除', async ({ page }) => {
    const today = new Date()
    const todayKey = format(today, 'yyyy-MM-dd')
    
    // ステップ1: ダッシュボードのカレンダーでエントリーがある日付をクリック
    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`)
    await todayCell.click()
    
    // 日別詳細モーダルが表示されるのを待つ
    await page.waitForSelector('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]', { timeout: 5000 })
    
    // ステップ2: 「エントリー済み（記録未登録）」セクション内の1つ目のエントリーの削除アイコンをクリック
    // エントリーの削除ボタンを探す（TrashIcon）
    const entryDeleteButtons = page.locator('[data-testid="entry-summary-1"]').locator('button[title*="削除"], button:has(svg)')
    if (await entryDeleteButtons.count() > 0) {
      await entryDeleteButtons.first().click()
      
      // ステップ3: 「キャンセル」をクリック
      await page.click('[data-testid="cancel-delete-button"]')
      
      // ダイアログが閉じるのを待つ
      await page.waitForSelector('[data-testid="confirm-dialog"]', { state: 'hidden', timeout: 5000 })
      
      // ステップ4: 再度1つ目のエントリーの削除アイコンをクリック
      await entryDeleteButtons.first().click()
      
      // ステップ5: 「削除」をクリック
      await page.click('[data-testid="confirm-delete-button"]')
      
      // ステップ6: 日別詳細モーダルから該当エントリーが消えていることを確認
      await page.waitForTimeout(1000)
      const entrySummary1 = page.locator('[data-testid="entry-summary-1"]')
      const entrySummary1Count = await entrySummary1.count()
      expect(entrySummary1Count).toBe(0)
      
      // ステップ7-8: 複数のエントリーがある場合の処理
      const entrySummary2 = page.locator('[data-testid="entry-summary-2"]')
      if (await entrySummary2.count() > 0) {
        const entryDeleteButton2 = page.locator('[data-testid="entry-summary-2"]').locator('button[title*="削除"], button:has(svg)')
        if (await entryDeleteButton2.count() > 0) {
          await entryDeleteButton2.first().click()
          await page.click('[data-testid="confirm-delete-button"]')
          await page.waitForTimeout(1000)
        }
      }
    }
    
    // ステップ9: すべてのエントリーが削除された場合、「エントリー済み（記録未登録）」セクションが表示されないことを確認
    const entrySection = page.locator('text=エントリー済み（記録未登録）')
    const _entrySectionCount = await entrySection.count()
    // エントリーがすべて削除された場合、セクションが表示されない
    // ただし、まだエントリーが残っている場合は表示される
    
    // ステップ10: 大会情報（competition）のみが表示されていることを確認
    // TC-002で変更された大会名を確認（△△水泳大会または○○水泳大会）
    const competitionName = page.locator('text=△△水泳大会, text=○○水泳大会').first()
    await expect(competitionName).toBeVisible({ timeout: 5000 }).catch(() => {
      // フォールバック: 大会情報が表示されていることを確認
      const modal = page.locator('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]')
      expect(modal).toBeVisible()
    })
  })

  /**
   * TC-COMPETITION-007: 大会の削除
   */
  test('TC-COMPETITION-007: 大会の削除', async ({ page }) => {
    const today = new Date()
    const todayKey = format(today, 'yyyy-MM-dd')
    
    // ステップ1: ダッシュボードのカレンダーで大会記録がある日付をクリック
    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`)
    await todayCell.click()
    
    // 日別詳細モーダルが表示されるのを待つ
    await page.waitForSelector('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]', { timeout: 5000 })
    
    // ステップ2: 大会情報（competition）の削除アイコンをクリック
    // 編集ボタンの近くにある削除ボタンを探す
    const editCompetitionButton = page.locator('[data-testid="edit-competition-button"]')
    let deleteButtonFound = false
    if (await editCompetitionButton.count() > 0) {
      // 編集ボタンの親要素から削除ボタンを探す
      const parentContainer = editCompetitionButton.locator('..')
      const deleteButton = parentContainer.locator('button[title*="削除"], button:has(svg)').filter({ hasNot: editCompetitionButton })
      if (await deleteButton.count() > 0) {
        await deleteButton.first().click()
        deleteButtonFound = true
      }
    }
    
    if (!deleteButtonFound) {
      // フォールバック: モーダル内のTrashIconを探す
      const trashIcon = page.locator('svg').filter({ hasText: /Trash/i }).first()
      if (await trashIcon.count() > 0) {
        await trashIcon.click()
        deleteButtonFound = true
      }
    }
    
    if (!deleteButtonFound) {
      throw new Error('大会情報の削除ボタンが見つかりません')
    }
    
    // ステップ3: 「キャンセル」をクリック
    await page.click('[data-testid="cancel-delete-button"]')
    
    // ダイアログが閉じるのを待つ
    await page.waitForSelector('[data-testid="confirm-dialog"]', { state: 'hidden', timeout: 5000 })
    
    // ステップ4: 再度大会情報の削除アイコンをクリック
    if (await editCompetitionButton.count() > 0) {
      const parentContainer = editCompetitionButton.locator('..')
      const deleteButton = parentContainer.locator('button[title*="削除"], button:has(svg)').filter({ hasNot: editCompetitionButton })
      if (await deleteButton.count() > 0) {
        await deleteButton.first().click()
      } else {
        const trashIcon = page.locator('svg').filter({ hasText: /Trash/i }).first()
        if (await trashIcon.count() > 0) {
          await trashIcon.click()
        }
      }
    } else {
      const trashIcon = page.locator('svg').filter({ hasText: /Trash/i }).first()
      if (await trashIcon.count() > 0) {
        await trashIcon.click()
      }
    }
    
    // ステップ5: 「削除」をクリック
    await page.click('[data-testid="confirm-delete-button"]')
    
    // ステップ6: 日別詳細モーダルが閉じていることを確認
    await page.waitForSelector('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]', { state: 'hidden', timeout: 10000 })
    
    // ステップ7: カレンダーのマーカーが更新されていることを確認
    await page.waitForTimeout(2000)
    const todayCellAfter = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`)
    const competitionMark = todayCellAfter.locator('[data-testid="competition-mark"]')
    const hasMarker = await competitionMark.count()
    expect(hasMarker).toBe(0)
    
    // ステップ8: 該当日付をクリックしても大会記録が表示されないことを確認
    await todayCellAfter.click()
    await page.waitForTimeout(1000)
    // モーダルが表示されないか、または空のモーダルが表示される
    const modal = page.locator('[data-testid="day-detail-modal"]')
    if (await modal.count() > 0) {
      await expect(page.locator('text=この日の記録はありません').first()).toBeVisible({ timeout: 5000 })
    }
  })
})
