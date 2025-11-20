import type { Page } from '@playwright/test'
import { TIMEOUTS, URLS } from '../config/constants'
import { BaseAction } from './BaseAction'
import { LoginPage } from '../pages/LoginPage'
import { SignupPage } from '../pages/SignupPage'

/**
 * サインアップフローを実行するAction
 */
export class SignupAction extends BaseAction {
  private readonly loginPage: LoginPage
  private readonly signupPage: SignupPage

  constructor(page: Page) {
    super(page)
    this.loginPage = new LoginPage(page)
    this.signupPage = new SignupPage(page)
  }

  /**
   * サインアップフローを実行
   * @param baseUrl ベースURL
   * @param name 名前
   * @param email メールアドレス
   * @param password パスワード
   */
  async execute(
    baseUrl: string,
    name: string,
    email: string,
    password: string
  ): Promise<void> {
    try {
      console.log('📝 サインアップフロー開始')

      // Step 1: ログインページに遷移
      console.log('📄 ログインページへ遷移')
      await this.loginPage.goto(`${baseUrl}${URLS.LOGIN}`)
      await this.loginPage.waitForReady()

      // Step 2: サインアップモードに切り替え
      console.log('🔄 サインアップモードに切り替え')
      await this.loginPage.switchToSignupMode()

      // Step 3: フォームに入力
      console.log('📧 フォームに入力')
      await this.signupPage.fillName(name)
      await this.signupPage.fillEmail(email)
      await this.signupPage.fillPassword(password)

      // Step 4: サインアップボタンをクリック
      console.log('✅ サインアップボタンをクリック')
      await this.signupPage.clickSignup()

      // Step 5: 成功メッセージの表示を待つ
      console.log('⏳ 成功メッセージの表示を待機')
      await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)

      console.log('✅ サインアップフロー完了')
    } catch (error) {
      await this.handleError(error as Error, 'Signup')
    }
  }
}

