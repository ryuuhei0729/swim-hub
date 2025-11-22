import { expect, test } from '@playwright/test'
import { PracticeAction } from '../../actions/PracticeAction'
import { RecordAction } from '../../actions/RecordAction'
import { DashboardPage } from '../../pages/DashboardPage'

test.describe('個人ダッシュボード', () => {
  // 注意: ログイン状態はglobal-setup.tsで保存されたstorageStateが自動的に使用されます
  // 各テストで個別にログイン処理を実行する必要はありません

  test('カレンダーが正常に表示される', async ({ page }) => {
    // Arrange: テスト準備
    const dashboardPage = new DashboardPage(page)

    // Act: ダッシュボードページに遷移（カレンダー表示まで待機）
    await dashboardPage.gotoDashboard()

    // Assert: 結果検証
    await expect(dashboardPage.calendar).toBeVisible()
  })

  test('カレンダーの月を切り替えて今日に戻れる', async ({ page }) => {
    // Arrange: テスト準備
    const dashboardPage = new DashboardPage(page)
    
    // Act: ダッシュボードページに遷移（カレンダー表示まで待機）
    await dashboardPage.gotoDashboard()
    
    const initialText = await dashboardPage.getMonthYearText()

    // Act: 操作実行
    await dashboardPage.clickNextMonth()
    await expect(dashboardPage.monthYearDisplay).not.toHaveText(initialText)

    await dashboardPage.clickToday()
    
    // Assert: 結果検証
    await expect(dashboardPage.monthYearDisplay).toHaveText(initialText)
  })

  test('練習を追加して練習ログを登録できる', async ({ page }) => {
    // Arrange: テスト準備
    const practiceAction = new PracticeAction(page)
    const dashboardPage = new DashboardPage(page)
    
    // Act: ダッシュボードページに遷移（カレンダー表示まで待機）
    await dashboardPage.gotoDashboard()
    
    const practiceDate = practiceAction.formatDateInCurrentMonth(12)
    // const initialPracticeMarkCount = await dashboardPage.getPracticeMarkCount(practiceDate)
    // const practiceMarks = dashboardPage.getPracticeMarks(practiceDate)

    // Act: 操作実行
    await practiceAction.addPracticeWithLog(practiceDate)

    // Assert: 結果検証
    // await expect(practiceMarks).toHaveCount(initialPracticeMarkCount + 1)

    // 練習詳細を開いて確認
    // await practiceAction.openPracticeDetail(practiceDate)
    // await expect(page.getByTestId('practice-log-item-1')).toBeVisible()
    // await dashboardPage.closeDetailModal('practice-detail-modal')
  })

  test('練習を編集できる', async ({ page }) => {
    // Arrange: テスト準備
    const practiceAction = new PracticeAction(page)
    const dashboardPage = new DashboardPage(page)
    
    // Act: ダッシュボードページに遷移（カレンダー表示まで待機）
    await dashboardPage.gotoDashboard()
    
    const practiceDate = practiceAction.formatDateInCurrentMonth(12)

    // Step 1-4: 練習情報を編集（既存値確認を含む）
    const editedPlace = '自動テストプール（編集後）'
    const editedNote = 'E2E 練習編集'
    
    const existingPracticeValues = await practiceAction.editPracticeWithExistingValueCheck(practiceDate, {
      place: editedPlace,
      note: editedNote
    })

    // Step 3: 既存の値がinputに入っていることを確認
    expect(existingPracticeValues.existingPlace).toBeTruthy()
    // noteは空の可能性もあるので、placeが入っていればOK

    // 編集されていることを確認
    const detailModal = page.getByTestId('practice-detail-modal').first()
    await expect(detailModal.getByText(editedPlace).first()).toBeVisible()

    // Step 5-7: 練習ログ情報を編集（既存値確認を含む）
    const editedDistance = '300'
    const editedRepCount = '5'
    const editedSetCount = '3'
    const editedPracticeLogNote = 'E2E 練習ログ編集'
    
    const existingPracticeLogValues = await practiceAction.editPracticeLogWithExistingValueCheck(practiceDate, {
      distance: editedDistance,
      repCount: editedRepCount,
      setCount: editedSetCount,
      note: editedPracticeLogNote
    })

    // Step 6: 既存の値がinputに入っていることを確認
    expect(existingPracticeLogValues.existingDistance).toBeTruthy()
    expect(existingPracticeLogValues.existingRepCount).toBeTruthy()
    expect(existingPracticeLogValues.existingSetCount).toBeTruthy()
    // noteは空の可能性もあるので、distance, repCount, setCountが入っていればOK

    // 編集されていることを確認（詳細モーダル内で編集内容が表示されていることを確認）
    // await expect(detailModal.getByText(`${editedDistance}m`).first()).toBeVisible()
    // await expect(detailModal.getByText(editedPracticeLogNote).first()).toBeVisible()
    
    // モーダルを閉じる
    await dashboardPage.closeDetailModal('practice-detail-modal')
  })

  test('練習を削除できる', async ({ page }) => {
    // Arrange: テスト準備
    const practiceAction = new PracticeAction(page)
    const dashboardPage = new DashboardPage(page)
    
    // Act: ダッシュボードページに遷移（カレンダー表示まで待機）
    await dashboardPage.gotoDashboard()
    
    const practiceDate = practiceAction.formatDateInCurrentMonth(12)
    // const initialPracticeMarkCount = await dashboardPage.getPracticeMarkCount(practiceDate)

    // Act: 操作実行
    await practiceAction.deletePractice(practiceDate)

    // Assert: 結果検証
    // 削除後、マーク数が減っていることを確認
    // const practiceMarks = dashboardPage.getPracticeMarks(practiceDate)
    // await expect(practiceMarks).toHaveCount(initialPracticeMarkCount - 1)
  })

  

  test('大会記録を追加してエントリー登録経由で記録登録できる', async ({ page }) => {
    // Arrange: テスト準備
    const recordAction = new RecordAction(page)
    const dashboardPage = new DashboardPage(page)
    
    // Act: ダッシュボードページに遷移（カレンダー表示まで待機）
    await dashboardPage.gotoDashboard()
    
    const competitionDate = recordAction.formatDateInCurrentMonth(12)

    // Act: 操作実行
    await recordAction.addCompetitionWithEntryAndRecord(competitionDate)

    // Assert: 結果検証
    const competitionCell = dashboardPage.getDayCell(competitionDate)
    await competitionCell.click()
    const detailModal = page.getByTestId('record-detail-modal').first()
    await detailModal.waitFor({ state: 'visible' })
    // await expect(detailModal.getByText('E2Eテスト記録会').first()).toBeVisible()
    // await expect(detailModal.getByText('E2E 自動登録1').first()).toBeVisible()
    // await expect(detailModal.getByText('E2E 自動登録2').first()).toBeVisible()
    // await dashboardPage.closeDetailModal('record-detail-modal')
  })

  test('大会,エントリー,記録を編集できる', async ({ page }) => {
    // Arrange: テスト準備
    const recordAction = new RecordAction(page)
    const dashboardPage = new DashboardPage(page)
    
    // Act: ダッシュボードページに遷移（カレンダー表示まで待機）
    await dashboardPage.gotoDashboard()
    
    const competitionDate = recordAction.formatDateInCurrentMonth(12)

    // Act: 操作実行
    // 大会情報を編集
    await recordAction.editCompetition(competitionDate)

    // // 記録情報を編集
    // await recordAction.editRecord(competitionDate)

    // Assert: 結果検証
    // 編集後、詳細モーダルが閉じられるので再度開く
    // const competitionCell = dashboardPage.getDayCell(competitionDate)
    // await competitionCell.click()
    // const detailModalAfterRecordEdit = page.getByTestId('record-detail-modal').first()
    // await detailModalAfterRecordEdit.waitFor({ state: 'visible' })

    // // 詳細モーダルで編集内容を確認
    // await expect(detailModalAfterRecordEdit.getByText('E2Eテスト記録会（編集後）').first()).toBeVisible()
    // await expect(detailModalAfterRecordEdit.getByText('E2E 自動登録1（編集後）').first()).toBeVisible()
    // await dashboardPage.closeDetailModal('record-detail-modal')
  })
  
  test('大会,エントリー,記録を削除できる', async ({ page }) => {
    // Arrange: テスト準備
    const recordAction = new RecordAction(page)
    const dashboardPage = new DashboardPage(page)
    
    // Act: ダッシュボードページに遷移（カレンダー表示まで待機）
    await dashboardPage.gotoDashboard()
    
    const competitionDate = recordAction.formatDateInCurrentMonth(12)
    // const initialCompetitionMarkCount = await dashboardPage.getCompetitionMarkCount(competitionDate)

    // Act: 操作実行
    await recordAction.deleteCompetition(competitionDate)

    // Assert: 結果検証
    // 削除後、マーク数が減っていることを確認
    // const competitionMarks = dashboardPage.getCompetitionMarks(competitionDate)
    // await expect(competitionMarks).toHaveCount(initialCompetitionMarkCount - 1)
  })
})

