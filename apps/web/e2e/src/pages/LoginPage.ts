import type { Locator, Page } from '@playwright/test'
import { SELECTORS, TIMEOUTS } from '../config/config'
import { BasePage } from './BasePage'

/**
 * ログインページのPage Object
 */
export class LoginPage extends BasePage {
  // UI要素定義（data-testid優先）
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly loginButton: Locator
  readonly signupButton: Locator
  readonly toggleAuthModeButton: Locator
  readonly errorMessage: Locator
  readonly successMessage: Locator
  readonly resetPasswordLink: Locator

  constructor(page: Page) {
    super(page)
    
    // data-testidが存在する場合は優先使用
    this.emailInput = page.getByTestId('email-input')
    this.passwordInput = page.getByTestId('password-input')
    this.loginButton = page.getByTestId('login-button')
    this.signupButton = page.getByTestId('signup-button')
    this.toggleAuthModeButton = page.getByTestId('toggle-auth-mode-button')
    
    // エラーメッセージ・成功メッセージ（定数から読み込み）
    this.errorMessage = page.locator(SELECTORS.ERROR_ALERT)
    this.successMessage = page.locator(SELECTORS.SUCCESS_ALERT)
    
    // パスワードリセットリンク
    this.resetPasswordLink = page.locator('a:has-text("パスワードを忘れた方はこちら")')
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
   * ログインボタンをクリック
   */
  async clickLogin(): Promise<void> {
    await this.loginButton.click()
  }

  /**
   * サインアップモードに切り替え
   */
  async switchToSignupMode(): Promise<void> {
    await this.toggleAuthModeButton.click()
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
  }

  /**
   * ログインモードに切り替え（サインアップモードから戻る）
   * toggleAuthModeButtonをクリックしてログインモードに切り替える
   */
  async switchToLoginMode(): Promise<void> {
    await this.toggleAuthModeButton.click()
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
  }

  /**
   * パスワードリセットページへ遷移
   */
  async clickResetPasswordLink(): Promise<void> {
    await this.resetPasswordLink.click()
  }

  /**
   * エラーメッセージを取得
   */
  async getErrorMessage(): Promise<string> {
    return await this.errorMessage.textContent() || ''
  }

  /**
   * 成功メッセージを取得
   */
  async getSuccessMessage(): Promise<string> {
    return await this.successMessage.textContent() || ''
  }
}

