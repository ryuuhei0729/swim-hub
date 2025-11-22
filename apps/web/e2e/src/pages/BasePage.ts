import type { Page } from '@playwright/test'
import { TIMEOUTS } from '../config/config'

/**
 * Page Objectsの基底クラス
 * 共通の操作を提供
 */
export class BasePage {
  protected readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /**
   * ページに遷移
   */
  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' })
    // Supabaseのリアルタイム接続により networkidle/load は不安定
    // 代わりにbody要素の存在を確認してからSPAレンダリング完了を待つ
    await this.page.locator('body').waitFor({ state: 'attached' })
    await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)
  }

  /**
   * ページタイトルを取得
   */
  async getTitle(): Promise<string> {
    return await this.page.title()
  }

  /**
   * URLを取得
   */
  getUrl(): string {
    return this.page.url()
  }

  /**
   * ページの準備完了を待つ
   */
  async waitForReady(): Promise<void> {
    await this.page.locator('body').waitFor({ state: 'attached' })
    await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)
  }

  /**
   * ページのリロードを実行する
   */
  async reload(): Promise<void> {
    await this.page.reload()
  }

  /**
   * ブラウザバックを実行する
   */
  async goBack(): Promise<void> {
    await this.page.goBack()
  }

  /**
   * ブラウザフォワードを実行する
   */
  async goForward(): Promise<void> {
    await this.page.goForward()
  }
}

