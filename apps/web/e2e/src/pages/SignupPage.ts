import type { Locator, Page } from '@playwright/test'
import { TIMEOUTS, SELECTORS } from '../config/config'
import { BasePage } from './BasePage'

/**
 * サインアップページのPage Object
 */
export class SignupPage extends BasePage {
  readonly nameInput: Locator
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly signupButton: Locator
  readonly toggleAuthModeButton: Locator
  readonly errorMessage: Locator
  readonly successMessage: Locator

  constructor(page: Page) {
    super(page)
    
    this.nameInput = page.getByTestId('signup-name-input')
    this.emailInput = page.getByTestId('email-input')
    this.passwordInput = page.getByTestId('password-input')
    this.signupButton = page.getByTestId('signup-button')
    this.toggleAuthModeButton = page.getByTestId('toggle-auth-mode-button')
    
    // エラーメッセージ・成功メッセージ（定数から読み込み）
    this.errorMessage = page.locator(SELECTORS.ERROR_ALERT)
    this.successMessage = page.locator(SELECTORS.SUCCESS_ALERT)
  }

  /**
   * 名前を入力
   */
  async fillName(name: string): Promise<void> {
    await this.nameInput.fill(name)
  }

  /**
   * メールアドレスを入力
   */
  async fillEmail(email: string): Promise<void> {
    await this.emailInput.fill(email)
  }

  /**
   * パスワードを入力
   */
  async fillPassword(password: string): Promise<void> {
    await this.passwordInput.fill(password)
  }

  /**
   * サインアップボタンをクリック
   */
  async clickSignup(): Promise<void> {
    await this.signupButton.click()
  }

  /**
   * ログインモードに切り替え
   */
  async switchToLoginMode(): Promise<void> {
    await this.toggleAuthModeButton.click()
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
  }
}

