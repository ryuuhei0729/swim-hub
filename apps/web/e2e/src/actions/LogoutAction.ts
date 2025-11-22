import type { Page } from '@playwright/test'
import { TIMEOUTS } from '../config/config'
import { DashboardPage } from '../pages/DashboardPage'
import { BaseAction } from './BaseAction'

/**
 * ログアウトフローを実行するAction
 */
export class LogoutAction extends BaseAction {
  private readonly dashboardPage: DashboardPage

  constructor(page: Page) {
    super(page)
    this.dashboardPage = new DashboardPage(page)
  }

  /**
   * ログアウトフローを実行
   */
  async execute(): Promise<void> {
    try {
      console.log('🚪 ログアウトフロー開始')

      // Step 1: ログアウトを実行
      console.log('🚪 ログアウトボタンをクリック')
      await this.dashboardPage.logout()

      // Step 2: ログインページへのリダイレクトを確認
      await this.page.waitForURL(/.*\/login/, { timeout: TIMEOUTS.DEFAULT })

      console.log('✅ ログアウトフロー完了')
    } catch (error) {
      await this.handleError(error as Error, 'Logout')
    }
  }
}

