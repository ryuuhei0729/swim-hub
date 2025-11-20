import type { Page } from '@playwright/test'
import { TIMEOUTS } from '../config/constants'
import { BaseAction } from './BaseAction'
import { RecordPage } from '../pages/RecordPage'

/**
 * 記録操作フローを実行するAction
 */
export class RecordAction extends BaseAction {
  private readonly recordPage: RecordPage

  constructor(page: Page) {
    super(page)
    this.recordPage = new RecordPage(page)
  }

  /**
   * 日付を現在月の指定日にフォーマット
   */
  formatDateInCurrentMonth(day: number): string {
    const now = new Date()
    const target = new Date(now.getFullYear(), now.getMonth(), day)
    return target.toISOString().split('T')[0]
  }

  /**
   * 大会記録を追加してエントリー登録経由で記録登録
   */
  async addCompetitionWithEntryAndRecord(
    dateIso: string,
    competitionData: {
      title: string
      place: string
      poolType: string
      note?: string
    },
    entries: Array<{
      styleIndex: number
      time: string
      note?: string
    }>,
    records: Array<{
      time: string
      note?: string
      isRelay?: boolean
      splitTimes?: Array<{
        distance: string
        time: string
      }>
    }>
  ): Promise<void> {
    try {
      console.log('🏆 大会記録追加フロー開始')

      // Step 1: 大会追加モーダルを開く
      console.log('📋 大会追加モーダルを開く')
      await this.recordPage.openAddCompetitionModal(dateIso)

      // Step 2: 大会フォームに入力
      console.log('📝 大会フォームに入力')
      await this.recordPage.fillCompetitionForm({
        date: dateIso,
        ...competitionData,
      })

      // Step 3: 次へ（記録登録）ボタンをクリック
      console.log('➡️ エントリーフォームへ進む')
      await this.recordPage.clickNextToEntry()

      // Step 4: エントリー情報を登録
      console.log('📋 エントリー情報を登録')
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        await this.recordPage.fillEntryForm(i + 1, entry)
        if (i < entries.length - 1) {
          await this.recordPage.addEntry()
        }
      }
      await this.recordPage.submitEntry()

      // Step 5: 記録フォームに入力
      console.log('📊 記録フォームに入力')
      await this.recordPage.recordFormModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
      await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)

      for (let i = 0; i < records.length; i++) {
        const record = records[i]
        await this.recordPage.fillRecordForm(i + 1, record)

        // スプリットタイムを追加
        if (record.splitTimes) {
          for (let j = 0; j < record.splitTimes.length; j++) {
            await this.recordPage.addSplitTime(i + 1, j + 1, record.splitTimes[j])
          }
        }
      }

      // Step 6: 記録を保存
      console.log('💾 記録を保存')
      await this.recordPage.saveRecord()

      // Step 7: レンダリング完了を待つ
      await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)

      console.log('✅ 大会記録追加フロー完了')
    } catch (error) {
      await this.handleError(error as Error, 'AddCompetitionWithEntryAndRecord')
    }
  }

  /**
   * 大会情報を編集
   */
  async editCompetition(
    dateIso: string,
    competitionData: {
      title: string
      place: string
      poolType: string
      note?: string
    }
  ): Promise<void> {
    try {
      console.log('✏️ 大会情報編集フロー開始')

      // Step 1: 記録詳細モーダルを開く
      console.log('👁️ 記録詳細モーダルを開く')
      await this.recordPage.openRecordDetail(dateIso)

      // Step 2: 編集ボタンをクリック
      console.log('✏️ 編集ボタンをクリック')
      await this.recordPage.editCompetition()

      // Step 3: フォームを更新
      console.log('📝 フォームを更新')
      await this.recordPage.fillCompetitionForm({
        date: dateIso,
        ...competitionData,
      })

      // Step 4: 更新ボタンをクリック
      console.log('💾 更新ボタンをクリック')
      await this.recordPage.updateCompetition()

      // Step 5: レンダリング完了を待つ
      await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)

      console.log('✅ 大会情報編集フロー完了')
    } catch (error) {
      await this.handleError(error as Error, 'EditCompetition')
    }
  }

  /**
   * 記録情報を編集
   */
  async editRecord(
    dateIso: string,
    recordIndex: number,
    recordData: {
      time: string
      note?: string
    }
  ): Promise<void> {
    try {
      console.log('✏️ 記録情報編集フロー開始')

      // Step 1: 記録詳細モーダルを開く
      console.log('👁️ 記録詳細モーダルを開く')
      await this.recordPage.openRecordDetail(dateIso)

      // Step 2: 編集ボタンをクリック
      console.log('✏️ 編集ボタンをクリック')
      await this.recordPage.editRecord(recordIndex)

      // Step 3: フォームを更新
      console.log('📝 フォームを更新')
      await this.recordPage.fillRecordForm(recordIndex, recordData)

      // Step 4: 更新ボタンをクリック
      console.log('💾 更新ボタンをクリック')
      await this.recordPage.updateRecord()

      // Step 5: レンダリング完了を待つ
      await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)

      console.log('✅ 記録情報編集フロー完了')
    } catch (error) {
      await this.handleError(error as Error, 'EditRecord')
    }
  }
}

