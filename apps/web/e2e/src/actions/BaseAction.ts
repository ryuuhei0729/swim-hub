import type { Page } from '@playwright/test'

/**
 * Actionsの基底クラス
 * 共通の操作を提供
 */
export class BaseAction {
  protected readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /**
   * スクリーンショットを保存
   */
  protected async saveScreenshot(name: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    await this.page.screenshot({ 
      path: `screenshots/${name}_${timestamp}.png`,
      fullPage: true 
    })
  }

  /**
   * エラーハンドリング
   */
  protected async handleError(error: Error, actionName: string): Promise<void> {
    console.error(`=== ${actionName} でエラー発生 ===`)
    console.error(error.message)
    
    // スクリーンショット保存
    await this.saveScreenshot(`error_${actionName}`)
    
    // エラーを再スロー
    throw error
  }

  /**
   * 日付を現在月の指定日にフォーマット
   * @param day 日（1-31）
   * @returns ISO形式の日付文字列（YYYY-MM-DD）
   */
  formatDateInCurrentMonth(day: number): string {
    const now = new Date()
    const target = new Date(now.getFullYear(), now.getMonth(), day)
    return target.toISOString().split('T')[0]
  }
}

