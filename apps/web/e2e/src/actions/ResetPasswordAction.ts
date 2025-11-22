import type { Page } from '@playwright/test'
import { TIMEOUTS } from '../config/config'
import { LoginPage } from '../pages/LoginPage'
import { ResetPasswordPage } from '../pages/ResetPasswordPage'
import { BaseAction } from './BaseAction'

/**
 * パスワードリセットフローを実行するAction
 */
export class ResetPasswordAction extends BaseAction {
  private readonly loginPage: LoginPage
  private readonly resetPasswordPage: ResetPasswordPage

  constructor(page: Page) {
    super(page)
    this.loginPage = new LoginPage(page)
    this.resetPasswordPage = new ResetPasswordPage(page)
  }

  /**
   * パスワードリセットフローを実行
   * @param email メールアドレス
   */
  async execute(email: string): Promise<void> {
    try {
      console.log('🔐 パスワードリセットフロー開始')

      // Step 1: パスワードリセットリンクをクリック
      console.log('🔗 パスワードリセットリンクをクリック')
      await this.loginPage.clickResetPasswordLink()

      // Step 2: パスワードリセットページへの遷移を確認
      await this.page.waitForURL(/.*\/reset-password/, { timeout: TIMEOUTS.DEFAULT })
      await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)

      // Step 3: メールアドレスを入力
      console.log('📧 メールアドレスを入力')
      await this.resetPasswordPage.fillEmail(email)

      // Step 4: 送信ボタンをクリック
      console.log('📤 送信ボタンをクリック')
      await this.resetPasswordPage.clickSubmit()

      // Step 5: 成功メッセージの表示を待つ
      await this.resetPasswordPage.successMessage.waitFor({ state: 'visible', timeout: TIMEOUTS.DEFAULT })

      console.log('✅ パスワードリセットフロー完了')
    } catch (error) {
      await this.handleError(error as Error, 'ResetPassword')
    }
  }
}

