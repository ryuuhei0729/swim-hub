import type { Page } from '@playwright/test'
import { TIMEOUTS } from '../config/constants'
import { BaseAction } from './BaseAction'
import { PracticePage } from '../pages/PracticePage'

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
   * 日付を現在月の指定日にフォーマット
   */
  formatDateInCurrentMonth(day: number): string {
    const now = new Date()
    const target = new Date(now.getFullYear(), now.getMonth(), day)
    return target.toISOString().split('T')[0]
  }

  /**
   * 練習を追加して練習ログを登録
   */
  async addPracticeWithLog(
    dateIso: string,
    practiceData: {
      place: string
      note?: string
    },
    logData: {
      distance: string
      repCount: string
      setCount: string
      note?: string
    }
  ): Promise<void> {
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
        place: practiceData.place,
        note: practiceData.note,
      })

      // Step 4: 練習を保存
      console.log('💾 練習を保存')
      await this.practicePage.savePractice()

      // Step 5: 練習ログフォームに入力
      console.log('📊 練習ログフォームに入力')
      await this.practicePage.fillPracticeLogForm(logData)

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
}

