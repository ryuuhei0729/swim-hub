import type { Locator, Page } from '@playwright/test'
import { TIMEOUTS, URLS } from '../config/config'
import { BasePage } from './BasePage'

/**
 * ダッシュボードページのPage Object
 */
export class DashboardPage extends BasePage {
  readonly calendar: Locator
  readonly monthYearDisplay: Locator
  readonly nextMonthButton: Locator
  readonly prevMonthButton: Locator
  readonly todayButton: Locator

  constructor(page: Page) {
    super(page)
    
    this.calendar = page.getByTestId('calendar')
    this.monthYearDisplay = page.getByTestId('month-year-display')
    this.nextMonthButton = page.getByTestId('next-month-button')
    this.prevMonthButton = page.getByTestId('prev-month-button')
    this.todayButton = page.getByTestId('today-button')
  }

  /**
   * ダッシュボードページに遷移し、カレンダーが表示されるまで待機
   */
  async gotoDashboard(path: string = URLS.DASHBOARD): Promise<void> {
    await this.goto(path)
    // カレンダーが表示されるまで待機（データ読み込み完了を確認）
    await this.calendar.waitFor({ state: 'visible', timeout: TIMEOUTS.DEFAULT })
    // 追加の待機時間（Supabaseのデータ取得完了を待つ）
    await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)
  }

  /**
   * カレンダーの日付セルを取得
   */
  getDayCell(dateIso: string): Locator {
    return this.page.locator(`[data-testid="calendar-day"][data-date="${dateIso}"]`).first()
  }

  /**
   * 指定日の練習マーク要素を取得
   */
  getPracticeMarks(dateIso: string): Locator {
    return this.getDayCell(dateIso).locator('[data-testid="practice-mark"]')
  }

  /**
   * 指定日の練習マーク数を取得
   */
  async getPracticeMarkCount(dateIso: string): Promise<number> {
    return await this.getPracticeMarks(dateIso).count()
  }

  /**
   * 指定日の大会マーク要素を取得
   */
  getCompetitionMarks(dateIso: string): Locator {
    return this.getDayCell(dateIso).locator('[data-testid="competition-mark"], [data-testid="record-mark"]')
  }

  /**
   * 指定日の大会マーク数を取得
   */
  async getCompetitionMarkCount(dateIso: string): Promise<number> {
    return await this.getCompetitionMarks(dateIso).count()
  }

  /**
   * 日付セルにホバー
   */
  async hoverDayCell(dateIso: string): Promise<void> {
    const dayCell = this.getDayCell(dateIso)
    await dayCell.hover()
  }

  /**
   * 日付セルの追加ボタンをクリック
   */
  async clickDayAddButton(dateIso: string): Promise<void> {
    const dayCell = this.getDayCell(dateIso)
    await dayCell.locator('[data-testid="day-add-button"]').click()
  }

  /**
   * 月を次に進める
   */
  async clickNextMonth(): Promise<void> {
    await this.nextMonthButton.click()
    await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)
  }

  /**
   * 月を前に戻す
   */
  async clickPrevMonth(): Promise<void> {
    await this.prevMonthButton.click()
    await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)
  }

  /**
   * 今日の日付に戻る
   */
  async clickToday(): Promise<void> {
    await this.todayButton.click()
    await this.page.waitForTimeout(TIMEOUTS.SPA_RENDERING)
  }

  /**
   * 月年表示のテキストを取得
   */
  async getMonthYearText(): Promise<string> {
    return await this.monthYearDisplay.textContent() || ''
  }

  /**
   * 詳細モーダルをバツボタンで閉じる
   */
  async closeDetailModal(testId: string): Promise<void> {
    // モーダルが表示されていることを確認
    const modal = this.page.getByTestId(testId).first()
    await modal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    
    // モーダルアニメーション完了を待つ
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
    
    // モーダル内の閉じるボタンが表示されるまで待つ
    const closeButton = modal.getByTestId('modal-close-button').first()
    await closeButton.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    
    // 閉じるボタンをクリック
    await closeButton.click()
    
    // モーダルが閉じられるまで待つ
    await modal.waitFor({ state: 'hidden', timeout: TIMEOUTS.DEFAULT })
  }

  /**
   * ログアウトを実行
   */
  async logout(): Promise<void> {
    // ユーザーメニューを開く（header内のボタンで、ChevronDownIconを含むものを探す）
    // ChevronDownIconはsvg要素で、h-4 w-4クラスを持つ
    // より確実なセレクタ: header内のボタンで、AvatarとChevronDownIconを含むもの
    const userMenuButton = this.page.locator('header button').filter({ 
      has: this.page.locator('svg.h-4.w-4')
    }).first()
    
    // ボタンが表示されるまで待機
    await userMenuButton.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    
    // メニューが閉じていることを確認してからクリック
    const menuDropdown = this.page.locator('div[class*="absolute"][class*="right-0"][class*="mt-2"]')
    const isMenuOpen = await menuDropdown.isVisible().catch(() => false)
    
    if (!isMenuOpen) {
      await userMenuButton.click()
      await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
    }
    
    // ログアウトボタンをクリック（ロールベースで探す）
    const logoutButton = this.page.getByRole('button', { name: 'ログアウト' }).first()
    await logoutButton.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    
    // ログアウト処理の完了を待つ（リダイレクトを待つ）
    await Promise.all([
      logoutButton.click(),
      this.page.waitForURL(/.*\/login/, { timeout: TIMEOUTS.DEFAULT })
    ])
  }
}

