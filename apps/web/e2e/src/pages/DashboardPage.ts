import type { Locator, Page } from '@playwright/test'
import { TIMEOUTS } from '../config/constants'
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
   * カレンダーの日付セルを取得
   */
  getDayCell(dateIso: string): Locator {
    return this.page.locator(`[data-testid="calendar-day"][data-date="${dateIso}"]`).first()
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
}

