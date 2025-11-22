import type { Page } from '@playwright/test'
import { TIMEOUTS } from '../config/config'
import { RecordPage } from '../pages/RecordPage'
import { BaseAction } from './BaseAction'

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
   * 大会記録を追加してエントリー登録経由で記録登録
   * @param dateIso 日付（ISO形式）
   * @param competitionData 大会データ（オプショナル、デフォルト値を使用）
   * @param entries エントリーデータ（オプショナル、デフォルト値を使用）
   * @param records 記録データ（オプショナル、デフォルト値を使用）
   */
  async addCompetitionWithEntryAndRecord(
    dateIso: string,
    competitionData?: {
      title?: string
      place?: string
      poolType?: string
      note?: string
    },
    entries?: Array<{
      styleIndex?: number
      time?: string
      note?: string
    }>,
    records?: Array<{
      time?: string
      note?: string
      isRelay?: boolean
      splitTimes?: Array<{
        distance?: string
        time?: string
      }>
    }>
  ): Promise<void> {
    // デフォルト値
    const defaultCompetitionData = {
      title: competitionData?.title ?? 'E2Eテスト記録会',
      place: competitionData?.place ?? 'スイムセンター',
      poolType: competitionData?.poolType ?? '0',
      note: competitionData?.note ?? '自動テスト',
    }
    const defaultEntries = entries && entries.length > 0
      ? entries.map((entry, index) => ({
          styleIndex: entry.styleIndex ?? index + 2,
          time: entry.time ?? (index === 0 ? '35.00' : '1:06.50'),
          note: entry.note ?? `E2E エントリー${index + 1}`,
        }))
      : [
          { styleIndex: 2, time: '35.00', note: 'E2E エントリー1' },
          { styleIndex: 3, time: '1:06.50', note: 'E2E エントリー2' },
        ]
    const defaultRecords = records && records.length > 0
      ? records.map((record, index) => ({
          time: record.time ?? (index === 0 ? '34.50' : '1:04.50'),
          note: record.note ?? `E2E 自動登録${index + 1}`,
          isRelay: record.isRelay ?? (index === 1),
          splitTimes: record.splitTimes ?? (index === 0
            ? [{ distance: '25', time: '15.00' }]
            : [{ distance: '50', time: '31.00' }]),
        }))
      : [
          {
            time: '34.50',
            note: 'E2E 自動登録1',
            splitTimes: [{ distance: '25', time: '15.00' }],
          },
          {
            time: '1:04.50',
            note: 'E2E 自動登録2',
            isRelay: true,
            splitTimes: [{ distance: '50', time: '31.00' }],
          },
        ]
    try {
      console.log('🏆 大会記録追加フロー開始')

      // Step 1: 大会追加モーダルを開く
      console.log('📋 大会追加モーダルを開く')
      await this.recordPage.openAddCompetitionModal(dateIso)

      // Step 2: 大会フォームに入力
      console.log('📝 大会フォームに入力')
      await this.recordPage.fillCompetitionForm({
        date: dateIso,
        ...defaultCompetitionData,
      })

      // Step 3: 次へ（記録登録）ボタンをクリック
      console.log('➡️ エントリーフォームへ進む')
      await this.recordPage.clickNextToEntry()

      // Step 4: エントリー情報を登録
      console.log('📋 エントリー情報を登録')
      for (let i = 0; i < defaultEntries.length; i++) {
        const entry = defaultEntries[i]
        await this.recordPage.fillEntryForm(i + 1, entry)
        if (i < defaultEntries.length - 1) {
          await this.recordPage.addEntry()
        }
      }
      await this.recordPage.submitEntry()

      // Step 5: 記録フォームに入力
      console.log('📊 記録フォームに入力')
      await this.recordPage.recordFormModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
      await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)

      for (let i = 0; i < defaultRecords.length; i++) {
        const record = defaultRecords[i]
        await this.recordPage.fillRecordForm(i + 1, record)

        // スプリットタイムを追加
        if (record.splitTimes) {
          for (let j = 0; j < record.splitTimes.length; j++) {
            const splitTime = record.splitTimes[j]
            await this.recordPage.addSplitTime(i + 1, j + 1, {
              distance: splitTime.distance ?? '25',
              time: splitTime.time ?? '15.00',
            })
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
   * @param dateIso 日付（ISO形式）
   * @param competitionData 大会データ（オプショナル、デフォルト値を使用）
   */
  async editCompetition(
    dateIso: string,
    competitionData?: {
      title?: string
      place?: string
      poolType?: string
      note?: string
    }
  ): Promise<void> {
    // デフォルト値
    const defaultCompetitionData = {
      title: competitionData?.title ?? 'E2Eテスト記録会（編集後）',
      place: competitionData?.place ?? 'スイムセンター（編集後）',
      poolType: competitionData?.poolType ?? '1',
      note: competitionData?.note ?? '自動テスト（編集後）',
    }
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
        ...defaultCompetitionData,
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
   * @param dateIso 日付（ISO形式）
   * @param recordIndex 記録インデックス（1から始まる）
   * @param recordData 記録データ（オプショナル、デフォルト値を使用）
   */
  async editRecord(
    dateIso: string,
    recordIndex: number = 1,
    recordData?: {
      time?: string
      note?: string
    }
  ): Promise<void> {
    // デフォルト値
    const defaultRecordData = {
      time: recordData?.time ?? '33.50',
      note: recordData?.note ?? 'E2E 自動登録1（編集後）',
    }
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
      await this.recordPage.fillRecordForm(recordIndex, defaultRecordData)

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

  /**
   * 大会を削除
   * @param dateIso 日付（ISO形式）
   */
  async deleteCompetition(dateIso: string): Promise<void> {
    try {
      console.log('🗑️ 大会削除フロー開始')

      // Step 1: 記録詳細モーダルを開く
      console.log('👁️ 記録詳細モーダルを開く')
      await this.recordPage.openRecordDetail(dateIso)

      // Step 2: 削除ボタンをクリック
      console.log('🗑️ 削除ボタンをクリック')
      await this.recordPage.deleteCompetition()

      // Step 3: レンダリング完了を待つ
      await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)

      console.log('✅ 大会削除フロー完了')
    } catch (error) {
      await this.handleError(error as Error, 'DeleteCompetition')
    }
  }
}

