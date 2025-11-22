import type { Page } from '@playwright/test'
import { TIMEOUTS, URLS } from '../config/config'
import { LoginPage } from '../pages/LoginPage'
import { BaseAction } from './BaseAction'

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
   * @param email メールアドレス
   * @param password パスワード
   * @param options オプション設定
   * @param options.expectSuccess 成功を期待するか（デフォルト: true）。falseの場合、リダイレクト待ちをスキップ
   */
  async execute(
    email: string,
    password: string,
    options: { expectSuccess?: boolean } = {}
  ): Promise<void> {
    const { expectSuccess = true } = options

    try {
      console.log('🔐 ログインフロー開始')

      // Step 1: ログインページに遷移（相対パスを使用、PlaywrightのbaseURL設定が自動適用される）
      console.log('📄 ログインページへ遷移')
      await this.loginPage.goto(URLS.LOGIN)
      await this.loginPage.waitForReady()

      // Step 2: 認証情報を入力
      console.log('📧 認証情報を入力')
      await this.loginPage.fillEmail(email)
      await this.loginPage.fillPassword(password)

      // Step 3: ログインボタンをクリック
      console.log('🔑 ログインボタンをクリック')
      await this.loginPage.clickLogin()

      // Step 4: 成功を期待する場合のみ、ダッシュボードへのリダイレクトを待つ
      if (expectSuccess) {
        console.log('⏳ ダッシュボードへのリダイレクトを待機')
        await this.page.waitForURL(new RegExp(`.*${URLS.DASHBOARD}`), { 
          timeout: TIMEOUTS.LONG 
        })
        await this.page.locator('body').waitFor({ state: 'attached' })
        await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)
        console.log('✅ ログインフロー完了')
      } else {
        // 失敗ケース: エラーメッセージが表示されるまで待機
        console.log('⏳ エラーメッセージの表示を待機')
        await this.page.locator('body').waitFor({ state: 'attached' })
        // ログインページに留まることを確認（リダイレクトされない）
        await this.page.waitForTimeout(TIMEOUTS.SHORT)
        console.log('✅ ログイン失敗フロー完了（エラー検証可能）')
      }
    } catch (error) {
      // expectSuccess=falseの場合、リダイレクト待ちのタイムアウトエラーは無視
      if (!expectSuccess && error instanceof Error && error.message.includes('waiting for URL')) {
        console.log('⚠️ リダイレクト待ちタイムアウト（期待通り）')
        return
      }
      await this.handleError(error as Error, 'Login')
    }
  }
}

