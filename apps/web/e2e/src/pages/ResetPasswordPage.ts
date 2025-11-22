import type { Locator, Page } from '@playwright/test'
import { SELECTORS, TIMEOUTS } from '../config/config'
import { BasePage } from './BasePage'

/**
 * パスワードリセットページのPage Object
 */
export class ResetPasswordPage extends BasePage {
  readonly emailInput: Locator
  readonly submitButton: Locator
  readonly successMessage: Locator
  readonly errorMessage: Locator

  constructor(page: Page) {
    super(page)
    
    // メールアドレス入力（labelから探す）
    this.emailInput = page.locator('input[type="email"]')
    
    // 送信ボタン
    this.submitButton = page.locator('button[type="submit"]')
    
    // 成功メッセージ・エラーメッセージ（定数から読み込み）
    this.successMessage = page.locator(SELECTORS.SUCCESS_ALERT)
    this.errorMessage = page.locator(SELECTORS.ERROR_ALERT)
  }

  /**
   * メールアドレスを入力
   */
  async fillEmail(email: string): Promise<void> {
    await this.emailInput.fill(email)
  }

  /**
   * 送信ボタンをクリック
   */
  async clickSubmit(): Promise<void> {
    await this.submitButton.click()
    await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)
  }

  /**
   * 成功メッセージを取得
   */
  async getSuccessMessage(): Promise<string> {
    return await this.successMessage.textContent() || ''
  }

  /**
   * エラーメッセージを取得
   */
  async getErrorMessage(): Promise<string> {
    return await this.errorMessage.textContent() || ''
  }
}

