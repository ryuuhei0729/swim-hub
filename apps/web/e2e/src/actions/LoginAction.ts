import type { Page } from '@playwright/test'
import { TIMEOUTS, URLS } from '../config/constants'
import { BaseAction } from './BaseAction'
import { LoginPage } from '../pages/LoginPage'

/**
 * ログインフローを実行するAction
 */
export class LoginAction extends BaseAction {
  private readonly loginPage: LoginPage

  constructor(page: Page) {
    super(page)
    this.loginPage = new LoginPage(page)
  }

  /**
   * ログインフローを実行
   * @param baseUrl ベースURL
   * @param email メールアドレス
   * @param password パスワード
   */
  async execute(baseUrl: string, email: string, password: string): Promise<void> {
    try {
      console.log('🔐 ログインフロー開始')

      // Step 1: ログインページに遷移
      console.log('📄 ログインページへ遷移')
      await this.loginPage.goto(`${baseUrl}${URLS.LOGIN}`)
      await this.loginPage.waitForReady()

      // Step 2: 認証情報を入力
      console.log('📧 認証情報を入力')
      await this.loginPage.fillEmail(email)
      await this.loginPage.fillPassword(password)

      // Step 3: ログインボタンをクリック
      console.log('🔑 ログインボタンをクリック')
      await this.loginPage.clickLogin()

      // Step 4: ダッシュボードへのリダイレクトを待つ
      console.log('⏳ ダッシュボードへのリダイレクトを待機')
      await this.page.waitForURL(new RegExp(`.*${URLS.DASHBOARD}`), { 
        timeout: TIMEOUTS.LONG 
      })
      await this.page.waitForLoadState('networkidle')
      await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)

      console.log('✅ ログインフロー完了')
    } catch (error) {
      await this.handleError(error as Error, 'Login')
    }
  }
}

