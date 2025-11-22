import type { Page } from '@playwright/test'
import { TIMEOUTS } from '../config/config'
import { PracticePage } from '../pages/PracticePage'
import { BaseAction } from './BaseAction'

/**
 * 練習操作フローを実行するAction
 */
export class PracticeAction extends BaseAction {
  private readonly practicePage: PracticePage

  constructor(page: Page) {
    super(page)
    this.practicePage = new PracticePage(page)
  }

  /**
   * 練習を追加して練習ログを登録
   * @param dateIso 日付（ISO形式）
   * @param practiceData 練習データ（オプショナル、デフォルト値を使用）
   * @param logData 練習ログデータ（オプショナル、デフォルト値を使用）
   */
  async addPracticeWithLog(
    dateIso: string,
    practiceData?: {
      place?: string
      note?: string
    },
    logData?: {
      distance?: string
      repCount?: string
      setCount?: string
      note?: string
    }
  ): Promise<void> {
    // デフォルト値
    const defaultPracticeData = {
      place: practiceData?.place ?? '自動テストプール',
      note: practiceData?.note ?? 'E2E 練習追加',
    }
    const defaultLogData = {
      distance: logData?.distance ?? '200',
      repCount: logData?.repCount ?? '4',
      setCount: logData?.setCount ?? '2',
      note: logData?.note ?? 'E2E 練習ログ',
    }
    try {
      console.log('🏊 練習追加フロー開始')

      // Step 1: 追加メニューモーダルを開く
      console.log('📋 追加メニューモーダルを開く')
      await this.practicePage.openAddMenuModal(dateIso)

      // Step 2: 練習追加ボタンをクリック
      console.log('➕ 練習追加ボタンをクリック')
      await this.practicePage.clickAddPracticeButton()

      // Step 3: 練習フォームに入力
      console.log('📝 練習フォームに入力')
      await this.practicePage.fillPracticeForm({
        date: dateIso,
        place: defaultPracticeData.place,
        note: defaultPracticeData.note,
      })

      // Step 4: 練習を保存
      console.log('💾 練習を保存')
      await this.practicePage.savePractice()

      // Step 5: 練習ログフォームに入力
      console.log('📊 練習ログフォームに入力')
      await this.practicePage.fillPracticeLogForm(defaultLogData)

      // Step 6: 練習ログを保存
      console.log('💾 練習ログを保存')
      await this.practicePage.savePracticeLog()

      // Step 7: レンダリング完了を待つ
      await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)

      console.log('✅ 練習追加フロー完了')
    } catch (error) {
      await this.handleError(error as Error, 'AddPracticeWithLog')
    }
  }

  /**
   * 練習詳細を開く
   */
  async openPracticeDetail(dateIso: string): Promise<void> {
    try {
      console.log('👁️ 練習詳細を開く')
      await this.practicePage.openPracticeDetail(dateIso)
    } catch (error) {
      await this.handleError(error as Error, 'OpenPracticeDetail')
    }
  }

  /**
   * 練習情報を編集
   * @param dateIso 日付（ISO形式）
   * @param practiceData 練習データ（オプショナル、デフォルト値を使用）
   */
  async editPractice(
    dateIso: string,
    practiceData?: {
      place?: string
      note?: string
    }
  ): Promise<void> {
    // デフォルト値
    const defaultPracticeData = {
      place: practiceData?.place ?? '自動テストプール（編集後）',
      note: practiceData?.note ?? 'E2E 練習編集',
    }
    try {
      console.log('✏️ 練習情報編集フロー開始')

      // Step 1: 練習詳細モーダルを開く
      console.log('👁️ 練習詳細モーダルを開く')
      await this.practicePage.openPracticeDetail(dateIso)

      // Step 2: 編集ボタンをクリック
      console.log('✏️ 編集ボタンをクリック')
      await this.practicePage.editPractice()

      // Step 3: フォームを更新
      console.log('📝 フォームを更新')
      await this.practicePage.fillPracticeForm({
        date: dateIso,
        place: defaultPracticeData.place,
        note: defaultPracticeData.note,
      })

      // Step 4: 更新ボタンをクリック
      console.log('💾 更新ボタンをクリック')
      await this.practicePage.updatePractice()

      // Step 5: レンダリング完了を待つ
      await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)

      console.log('✅ 練習情報編集フロー完了')
    } catch (error) {
      await this.handleError(error as Error, 'EditPractice')
    }
  }

  /**
   * 練習を削除
   * @param dateIso 日付（ISO形式）
   */
  async deletePractice(dateIso: string): Promise<void> {
    try {
      console.log('🗑️ 練習削除フロー開始')

      // Step 1: 練習詳細モーダルを開く
      console.log('👁️ 練習詳細モーダルを開く')
      await this.practicePage.openPracticeDetail(dateIso)

      // Step 2: 削除ボタンをクリック
      console.log('🗑️ 削除ボタンをクリック')
      await this.practicePage.deletePractice()

      // Step 3: レンダリング完了を待つ
      await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)

      console.log('✅ 練習削除フロー完了')
    } catch (error) {
      await this.handleError(error as Error, 'DeletePractice')
    }
  }

  /**
   * 練習情報を編集（既存値確認を含む）
   * @param dateIso 日付（ISO形式）
   * @param practiceData 編集する練習データ
   * @returns 既存の値
   */
  async editPracticeWithExistingValueCheck(
    dateIso: string,
    practiceData: {
      place: string
      note: string
    }
  ): Promise<{
    existingPlace: string
    existingNote: string
  }> {
    try {
      console.log('✏️ 練習情報編集フロー開始（既存値確認含む）')

      // Step 1: 日付セルをクリックして詳細モーダルを開く
      console.log('📅 日付セルをクリック')
      await this.practicePage.clickDayCell(dateIso)

      // Step 2: 練習編集ボタンをクリック
      console.log('✏️ 練習編集ボタンをクリック')
      await this.practicePage.editPractice()

      // Step 3: 既存の値を取得
      console.log('📋 既存の値を取得')
      const existingValues = await this.practicePage.getExistingPracticeFormValues()

      // Step 4: フォームを更新
      console.log('📝 フォームを更新')
      await this.practicePage.fillPracticeForm({
        date: dateIso,
        place: practiceData.place,
        note: practiceData.note,
      })

      // Step 5: 更新ボタンをクリック
      console.log('💾 更新ボタンをクリック')
      await this.practicePage.updatePractice()

      // Step 6: レンダリング完了を待つ
      await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)

      console.log('✅ 練習情報編集フロー完了')
      return existingValues
    } catch (error) {
      await this.handleError(error as Error, 'EditPracticeWithExistingValueCheck')
      throw error
    }
  }

  /**
   * 練習ログ情報を編集（既存値確認を含む）
   * @param dateIso 日付（ISO形式）
   * @param logData 編集する練習ログデータ
   * @returns 既存の値
   */
  async editPracticeLogWithExistingValueCheck(
    dateIso: string,
    logData: {
      distance: string
      repCount: string
      setCount: string
      note: string
    }
  ): Promise<{
    existingDistance: string
    existingRepCount: string
    existingSetCount: string
    existingNote: string
  }> {
    try {
      console.log('✏️ 練習ログ情報編集フロー開始（既存値確認含む）')

      // Step 1: 練習ログ編集ボタンをクリック
      console.log('✏️ 練習ログ編集ボタンをクリック')
      await this.practicePage.editPracticeLog()

      // Step 2: 既存の値を取得
      console.log('📋 既存の値を取得')
      const existingValues = await this.practicePage.getExistingPracticeLogFormValues()

      // Step 3: フォームを更新
      console.log('📝 フォームを更新')
      await this.practicePage.fillPracticeLogForm({
        distance: logData.distance,
        repCount: logData.repCount,
        setCount: logData.setCount,
        note: logData.note,
      })

      // Step 4: 更新ボタンをクリック
      console.log('💾 更新ボタンをクリック')
      await this.practicePage.updatePracticeLog()

      // Step 5: レンダリング完了を待つ
      await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)

      console.log('✅ 練習ログ情報編集フロー完了')
      return existingValues
    } catch (error) {
      await this.handleError(error as Error, 'EditPracticeLogWithExistingValueCheck')
      throw error
    }
  }
}

